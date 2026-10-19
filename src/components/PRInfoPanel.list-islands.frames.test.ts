import { test, expect, describe } from "bun:test"
import { BoxRenderable, type Renderable } from "@opentui/core"
import type { PrCheck } from "../providers/github"
import { bgAt, fgAt, findText, ints } from "../testing/frame"
import { previews, prInfo } from "../testing/pr-info"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { colors, theme } from "../theme"

// The previews, checks, files and commits sections as Solid islands: what
// a push after a cursor move, a label or a filter draws, and what destroy
// leaves.

const mount = usePrInfoPanel()

describe("previews", () => {
  test("size the app column to the widest app, links blue, a status and the build overlay0, row 0 on surface0", async () => {
    const set = previews()
    set.rows.push({ app: "storefront-checkout", links: [{ label: "preview", url: "https://x" }] })
    const { lines, spans } = await mount({
      section: "previews",
      prepare: (p) => {
        p.setPreviews(set)
        p.moveCursor(1)
      },
    })
    expect(lines.slice(11, 16)).toEqual([
      "  ▼  Previews (3)",
      "",
      "    web                  preview  storybook  #812",
      "    admin                on demand",
      "    storefront-checkout  preview",
    ])
    expect(bgAt(spans, 4, 13)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 115, 13)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 4, 13)).toEqual(ints(theme.text))
    expect(fgAt(spans, ...find(lines, "preview  storybook"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "#812"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "on demand"))).toEqual(ints(theme.overlay0))
    expect(bgAt(spans, 4, 14)).toEqual(ints(theme.base))
    expect(fgAt(spans, 4, 15)).toEqual(ints(theme.subtext1))
  })
})

/** The rows an island has drawn, one per cursor stop. */
const islandRows = (root: Renderable, id: string) =>
  root.findDescendantById(id)!.getChildren().filter((child) => child instanceof BoxRenderable)

describe("a cursor move in checks", () => {
  test("from a check onto its annotation restyles both on the renderables already drawn", async () => {
    const { lines, spans, panel, mounted } = await mount({
      section: "checks",
      prepare: (p) => {
        p.toggleCheckExpansion(3)
        p.moveCursor(3)
      },
    })
    const [, y] = find(lines, "✗ test")
    expect(bgAt(spans, 4, y)).toEqual(ints(theme.surface0))
    const root = mounted.setup.renderer.root
    const before = islandRows(root, "pr-info-checks")

    panel.moveCursor(1)
    const moved = (await mounted.frame()).split("\n")
    const after = mounted.setup.captureSpans()
    expect(moved.slice(y, y + 3)).toEqual(["    ✗ test (failure)  ▼ [2]", "      • src/greet.ts:12:5", "          Expected 2, got 3"])
    expect(bgAt(after, 4, y)).toEqual(ints(theme.base))
    expect(fgAt(after, 6, y)).toEqual(ints(theme.subtext1))
    for (const row of [y + 1, y + 2]) {
      expect(bgAt(after, 4, row)).toEqual(ints(theme.surface0))
      expect(bgAt(after, 115, row)).toEqual(ints(theme.surface0))
    }
    expect(fgAt(after, 8, y + 1)).toEqual(ints(theme.text))
    const rows = islandRows(root, "pr-info-checks")
    expect(rows).toHaveLength(before.length)
    rows.forEach((row, i) => expect(row).toBe(before[i]!))
  })
})

describe("a cursor move in files", () => {
  test("restyles the rows it leaves and enters, on the renderables already drawn", async () => {
    const { spans, panel, mounted } = await mount({ section: "files", prepare: (p) => p.moveCursor(1) })
    expect(bgAt(spans, 4, 19)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 4, 20)).toEqual(ints(theme.base))
    const greet = findText(mounted.setup.renderer.root, "src/greet.ts   ")

    panel.moveCursor(1)
    const lines = (await mounted.frame()).split("\n")
    const moved = mounted.setup.captureSpans()
    expect(lines.slice(19, 21)).toEqual(["    src/greet.ts       +3    -1", "    src/farewell.ts    +5    -0"])
    expect(bgAt(moved, 4, 19)).toEqual(ints(theme.base))
    expect(fgAt(moved, 4, 19)).toEqual(ints(theme.subtext1))
    expect(bgAt(moved, 4, 20)).toEqual(ints(theme.surface0))
    expect(bgAt(moved, 115, 20)).toEqual(ints(theme.surface0))
    expect(fgAt(moved, 4, 20)).toEqual(ints(theme.text))
    expect(findText(mounted.setup.renderer.root, "src/greet.ts   ")).toBe(greet!)
  })
})

describe("flash labels", () => {
  test("go in front of a commit and a file row in the flash colour, and leave with the labels", async () => {
    const { lines, spans, panel, mounted } = await mount({
      section: "files",
      height: 50,
      prepare: (p) => {
        p.setActiveSection("commits")
        p.expandSection()
        p.setFlashLabels(new Map([["commits:0", "a"], ["files:1", "sd"]]))
      },
    })
    expect(lines[20]).toBe("    sd src/farewell.ts    +5    -0")
    // The long first commit already overflows its row, so the label's
    // trailing space is squeezed out with the time column's padding.
    expect(lines[24]).toStartWith("    a23h     c00abcd feat:")
    expect(fgAt(spans, 4, 20)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 7, 20)).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, 4, 24)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 5, 24)).toEqual(ints(theme.subtext0))

    panel.setFlashLabels(new Map())
    const cleared = (await mounted.frame()).split("\n")
    expect(cleared[20]).toBe("    src/farewell.ts    +5    -0")
    expect(cleared[24]).toStartWith("    23h    c00abcd feat:")
    expect(fgAt(mounted.setup.captureSpans(), 4, 20)).toEqual(ints(theme.subtext1))
  })

  // Commits past the twentieth are only counted, so `s` has no row to put
  // their labels on.
  test("go on the twenty drawn commit rows and on none of the three counted below them", async () => {
    const label = (i: number) => String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26))
    let labels = new Map<string, string>()
    const { lines } = await mount({
      section: "commits",
      height: 60,
      prepare: (p) => {
        labels = new Map(p.flashTargets().map((id, i) => [id, label(i)]))
        p.setFlashLabels(labels)
      },
    })
    expect([...labels.keys()].filter((id) => id.startsWith("commits:"))).toEqual(
      Array.from({ length: 20 }, (_, i) => `commits:${i}`)
    )

    const commitLines = lines.filter((line) => /c\d\dabcd /.test(line))
    expect(commitLines).toHaveLength(20)
    // The long first commit squeezes out its label's trailing space.
    commitLines.forEach((line, i) => expect(line).toMatch(new RegExp(`^    ${labels.get(`commits:${i}`)} ?\\d+h`)))
    for (const sha of ["c20abcd", "c21abcd", "c22abcd"]) expect(() => find(lines, sha)).toThrow()
    find(lines, "... +3 more")
  })
})

describe("flash labels in checks", () => {
  test("go in front of a check and an annotation's location, which keeps its message on a second line", async () => {
    const { lines, spans, panel, mounted } = await mount({
      section: "checks",
      prepare: (p) => {
        p.toggleCheckExpansion(3)
        p.setFlashLabels(new Map([["checks:2", "a"], ["checks:3", "sd"]]))
      },
    })
    const [, y] = find(lines, "✗ test")
    expect(lines.slice(y, y + 5)).toEqual([
      "    a ✗ test (failure)  ▼ [2]",
      "    sd   • src/greet.ts:12:5",
      "          Expected 2, got 3",
      "      • src/farewell.ts",
      "          Unused export",
    ])
    expect(fgAt(spans, 4, y)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, 6, y)).toEqual(ints(theme.red))
    expect(fgAt(spans, 4, y + 1)).toEqual(ints(colors.flashLabel))
    expect(fgAt(spans, ...find(lines, "• src/greet.ts"))).toEqual(ints(theme.red))

    panel.setFlashLabels(new Map())
    const cleared = (await mounted.frame()).split("\n")
    expect(cleared.slice(y, y + 3)).toEqual([
      "    ✗ test (failure)  ▼ [2]",
      "      • src/greet.ts:12:5",
      "          Expected 2, got 3",
    ])
    expect(fgAt(mounted.setup.captureSpans(), 4, y)).toEqual(ints(theme.red))
  })
})

describe("j through checks longer than the screen", () => {
  const failing = (id: number): PrCheck => ({
    id,
    name: `check-${id}`,
    status: "completed",
    conclusion: "failure",
    detailsUrl: null,
    startedAt: null,
    completedAt: null,
    annotationsStatus: "loaded",
    annotations: [0, 1].map((n) => ({
      path: `src/f${id}-${n}.ts`,
      startLine: 1,
      endLine: 1,
      level: "failure" as const,
      message: `message ${id}-${n}`,
    })),
  })

  test("keeps both lines of an annotation in view", async () => {
    const ids = Array.from({ length: 8 }, (_, i) => i + 1)
    const { panel, mounted } = await mount({
      section: "checks",
      height: 20,
      info: prInfo("Adds the skill.", { checks: ids.map(failing) }),
      prepare: (p) => ids.forEach((id) => p.toggleCheckExpansion(id)),
    })
    const viewport = panel.getScrollBox().viewport
    let annotations = 0
    while (panel.moveCursor(1)) {
      const lines = (await mounted.frame()).split("\n")
      const annotation = panel.getSelectedAnnotation()
      if (!annotation) continue
      annotations++
      const [, y] = find(lines, `${annotation.annotation.path}:1`)
      expect(lines[y + 1]).toContain(annotation.annotation.message)
      expect(y).toBeGreaterThanOrEqual(viewport.y)
      // Three rows short of the bottom edge, measured from the message line:
      // the row is one cursor stop two lines tall.
      expect(y + 1).toBeLessThanOrEqual(viewport.y + viewport.height - 1 - 3)
    }
    expect(annotations).toBe(16)
    expect(panel.getScrollBox().scrollTop).toBeGreaterThan(0)
  })
})

describe("a filter", () => {
  test("that matches no file says so, and clearing it brings the rows back in the same island", async () => {
    const { panel, mounted } = await mount({ section: "files" })
    const root = mounted.setup.renderer.root
    const island = root.findDescendantById("pr-info-files")
    expect(island).toBeDefined()

    panel.setFilter("matches-nothing")
    const filtered = (await mounted.frame()).split("\n")
    expect(filtered).toContain("    No files changed")
    expect(filtered.join("\n")).not.toContain("src/greet.ts")

    panel.setFilter("")
    const back = (await mounted.frame()).split("\n")
    expect(back.slice(17, 21)).toEqual([
      "  ▼  Files (2)",
      "",
      "    src/greet.ts       +3    -1",
      "    src/farewell.ts    +5    -0",
    ])
    expect(root.findDescendantById("pr-info-files")).toBe(island!)
  })
})

describe("destroy", () => {
  test("disposes every island, mounted or not, and leaves nothing of the panel under the root", async () => {
    const { panel, mounted } = await mount({
      section: "files",
      prepare: (p) => {
        p.setActiveSection("commits")
        p.expandSection()
        p.setActiveSection("previews")
        p.expandSection()
      },
    })
    const root = mounted.setup.renderer.root
    const islands = ["pr-info-previews", "pr-info-files", "pr-info-commits"].map((id) => root.findDescendantById(id)!)
    expect(islands.every(Boolean)).toBe(true)
    const description = root.findDescendantById("pr-info-description")!.parent!

    panel.collapseSection()
    panel.setActiveSection("description")
    panel.collapseSection()
    await mounted.frame()
    expect(root.findDescendantById("pr-info-previews")).toBeUndefined()
    expect(root.findDescendantById("pr-info-description")).toBeUndefined()

    panel.destroy()
    expect(root.getChildren()).toHaveLength(0)
    expect(islands.map((island) => island.isDestroyed)).toEqual([true, true, true])
    expect(description.isDestroyed).toBe(true)
  })
})
