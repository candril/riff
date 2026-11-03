import { test, expect, describe } from "bun:test"
import {
  detectPreviews,
  extractPreviewRows,
  isBuilding,
  isPending,
  previewState,
  runIdOf,
  tickDeployTask,
} from "./previews"
import { defaultConfig } from "../config/defaults"

const config = defaultConfig.previews

const BOT_COMMENT = `<!-- preview-links-and-size -->
Here is where PR 10747 went.

| App | Preview | Built |
| --- | --- | --- |
| 🛒 Shop | [🇨🇭 galaxus.ch](https://galaxus-ch-preview-pr10747.preview.example.com) · [🇦🇹 galaxus.at](https://galaxus-at-preview-pr10747.preview.example.com) | [17:14](https://example.com/runs/42) |
| 📱 Shop Mobile App | [Desktop](https://shop-mobile-preview-pr10747.preview.example.com) · [Android](https://app.browserstack.com/xyz) | [17:02](https://example.com/runs/41) |
| 🎨 Design System | *on demand* | — |
`

describe("lifting preview links out of a bot's table", () => {
  test("one row per app, links as labels", () => {
    const rows = extractPreviewRows(BOT_COMMENT, config, 10747)

    expect(rows.map((row) => row.app)).toEqual(["🛒 Shop", "📱 Shop Mobile App", "🎨 Design System"])
    expect(rows[0]?.links).toEqual([
      { label: "🇨🇭 galaxus.ch", url: "https://galaxus-ch-preview-pr10747.preview.example.com" },
      { label: "🇦🇹 galaxus.at", url: "https://galaxus-at-preview-pr10747.preview.example.com" },
    ])
  })

  test("a link in a row that qualified comes along even when it does not itself", () => {
    const mobile = extractPreviewRows(BOT_COMMENT, config, 10747)[1]

    expect(mobile?.links.map((link) => link.label)).toEqual(["Desktop", "Android"])
  })

  test("an italic cell is a status, not a dead link", () => {
    const design = extractPreviewRows(BOT_COMMENT, config, 10747)[2]

    expect(design?.status).toBe("on demand")
    expect(design?.links).toEqual([])
  })

  test("the last column carries when it was built and what built it", () => {
    const rows = extractPreviewRows(BOT_COMMENT, config, 10747)

    expect(rows[0]?.built).toEqual({ label: "17:14", url: "https://example.com/runs/42" })
  })

  test("without a named column it takes the links carrying this PR's number", () => {
    const table = `| App | Where | Built |
| --- | --- | --- |
| Shop | [live](https://shop-preview-pr77.example.com) | — |
| Docs | [live](https://docs.example.com) | — |
`
    const unnamed = { ...config, tableColumn: "Preview" }
    const rows = extractPreviewRows(table, unnamed, 77)

    expect(rows.map((row) => row.app)).toEqual(["Shop"])
    expect(extractPreviewRows(table, unnamed, 9999)).toEqual([])
  })

  test("a host the reader named qualifies whatever the URL carries", () => {
    const table = `| App | Where | Built |
| --- | --- | --- |
| Docs | [site](https://docs.preview.devinite.com/x) | — |
`
    const off = { ...config, matchPrNumber: false }

    expect(extractPreviewRows(table, off, 1)).toEqual([])
    expect(
      extractPreviewRows(table, { ...off, hosts: ["*.preview.devinite.com"] }, 1)[0]?.links.length
    ).toBe(1)
  })
})

const ON_DEMAND = `<!-- id = preview-links-and-size -->
| App | Preview | Built |
| :--- | :--- | :---: |
| 🛒 Shop | [galaxus.ch](https://galaxus-ch-preview-pr12134.preview.example.com) | [⏳](https://github.com/o/r/actions/runs/41609222736/attempts/1) |
| 🎨 Design System | *on demand* | [10:16<br><sub>03.11.26</sub>](https://github.com/o/r/actions/runs/41609222736/attempts/1) |
| 🔑 Identity Provider | *on demand* | [10:57<br><sub>03.11.26</sub>](https://github.com/o/r/actions/runs/41609222736/attempts/1) |
| 🤖 Shop MCP | *building* | [⏳](https://github.com/o/r/actions/runs/41609222736/attempts/1) |
| 🖼️ Demo Studio | [Preview](https://pr12134-demostudio.preview.example.com) | [11:00<br><sub>03.11.26</sub>](https://github.com/o/r/actions/runs/41609222736/attempts/1) |

- [ ] Deploy 🎨 Design System preview
- [x] Deploy 🔑 Identity Provider preview
- [ ] Deploy 🤖 Shop MCP preview
- [x] Deploy 🖼️ Demo Studio preview
`

describe("previews deployed on demand", () => {
  const rows = extractPreviewRows(ON_DEMAND, config, 12134)
  const byApp = (app: string) => rows.find((row) => row.app.includes(app))!

  test("a build cell's two lines read as one label, not run together", () => {
    expect(byApp("Design System").built?.label).toBe("10:16 03.11.26")
  })

  test("each row takes the task item that names it, and only the longest name wins", () => {
    expect(byApp("Design System").deploy).toEqual({ checked: false, line: "- [ ] Deploy 🎨 Design System preview" })
    expect(byApp("Shop MCP").deploy?.line).toBe("- [ ] Deploy 🤖 Shop MCP preview")
    expect(byApp("🛒 Shop").deploy).toBeUndefined()
  })

  test("without its emoji, a bare Shop still leaves Shop MCP's item alone", () => {
    const plain = ON_DEMAND.replace("🛒 Shop", "Shop").replace("🤖 Shop MCP |", "Shop MCP |").replace("🤖 Shop MCP preview", "Shop MCP preview")
    const plainRows = extractPreviewRows(plain, config, 12134)

    expect(plainRows.find((row) => row.app === "Shop")?.deploy).toBeUndefined()
    expect(plainRows.find((row) => row.app === "Shop MCP")?.deploy?.checked).toBe(false)
  })

  test("a cell held together with non-breaking spaces still names its task", () => {
    const nbsp = ON_DEMAND.replace("| 🎨 Design System |", "| 🎨 Design System |")
    const design = extractPreviewRows(nbsp, config, 12134).find((row) => row.app.includes("Design"))

    expect(design?.deploy?.checked).toBe(false)
  })

  test("the state reads off links first, then the build, then the task", () => {
    expect(rows.map((row) => [row.app, previewState(row)])).toEqual([
      ["🛒 Shop", "live"],
      ["🎨 Design System", "deployable"],
      ["🔑 Identity Provider", "requested"],
      ["🤖 Shop MCP", "building"],
      ["🖼️ Demo Studio", "live"],
    ])
  })

  test("a live row with an hourglass is rebuilding, and worth watching", () => {
    expect(isBuilding(byApp("🛒 Shop"))).toBe(true)
    expect(rows.filter(isPending).map((row) => row.app)).toEqual(["🛒 Shop", "🔑 Identity Provider", "🤖 Shop MCP"])
  })

  test("the run behind the build cell", () => {
    expect(runIdOf(byApp("Shop MCP"))).toBe("41609222736")
  })

  test("ticking changes the one line and nothing else", () => {
    const line = byApp("Design System").deploy!.line
    const ticked = tickDeployTask(ON_DEMAND, line)!

    expect(ticked).toBe(ON_DEMAND.replace(line, "- [x] Deploy 🎨 Design System preview"))
  })

  test("nothing to tick once the item is gone or already ticked", () => {
    const line = byApp("Design System").deploy!.line

    expect(tickDeployTask(ON_DEMAND.replace(line, ""), line)).toBeNull()
    expect(tickDeployTask(ON_DEMAND, byApp("Identity Provider").deploy!.line)).toBeNull()
  })

  test("a body with CRLF line ends ticks the same", () => {
    const crlf = ON_DEMAND.replace(/\n/g, "\r\n")
    const line = extractPreviewRows(crlf, config, 12134).find((row) => row.app.includes("Design"))!.deploy!.line

    expect(tickDeployTask(crlf, line)).toContain("- [x] Deploy 🎨 Design System preview\r\n")
  })
})

describe("finding the comment they live in", () => {
  const comments = [
    { id: 1, body: "no table here", author: "@alice", createdAt: "2026-01-01T10:00:00Z" },
    { id: 2, body: BOT_COMMENT, author: "@dg-helix-bot", createdAt: "2026-01-01T17:14:00Z" },
  ]

  test("names the comment so it can be folded away", () => {
    const found = detectPreviews(comments, config, 10747)

    expect(found).toMatchObject({ commentId: "2", author: "@dg-helix-bot" })
    expect(found?.rows.length).toBe(3)
  })

  test("the newest table wins — an older one points at deployments that are gone", () => {
    const reposted = [...comments, { ...comments[1]!, id: 3, body: BOT_COMMENT.replace("🛒 Shop", "🛒 Shop v2") }]

    expect(detectPreviews(reposted, config, 10747)?.commentId).toBe("3")
  })

  test("a configured marker is the whole rule when it is set", () => {
    const marked = { ...config, commentMarker: "preview-links-and-size" }
    const withoutMarker = [{ ...comments[1]!, body: BOT_COMMENT.replace("<!-- preview-links-and-size -->", "") }]

    expect(detectPreviews(comments, marked, 10747)?.commentId).toBe("2")
    expect(detectPreviews(withoutMarker, marked, 10747)).toBeNull()
  })

  test("a newer table linking back into the PR on GitHub is not one of previews", () => {
    const debt = `| Type | Description | File | Points |
| --- | --- | --- | --- |
| todo | TODO OSA | [src/a.tsx](https://github.com/o/r/pull/10747/files#diff-80da) | -1 |
`
    const later = [...comments, { id: 3, body: debt, author: "@dg-helix-bot", createdAt: "2026-01-01T17:20:00Z" }]

    expect(detectPreviews(later, config, 10747)?.commentId).toBe("2")
  })

  test("nothing to lift when no comment has a table", () => {
    expect(detectPreviews([comments[0]!], config, 10747)).toBeNull()
  })
})
