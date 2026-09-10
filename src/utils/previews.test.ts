import { test, expect, describe } from "bun:test"
import { detectPreviews, extractPreviewRows } from "./previews"
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

  test("nothing to lift when no comment has a table", () => {
    expect(detectPreviews([comments[0]!], config, 10747)).toBeNull()
  })
})
