import { test, expect, describe } from "bun:test"
import { bgAt, fgAt, findText, ints } from "../testing/frame"
import { previews } from "../testing/pr-info"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { colors, theme } from "../theme"

// The previews, files and commits sections as Solid islands: what a push
// after a cursor move, a label or a filter draws, and what destroy leaves.

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

    panel.collapseSection()
    await mounted.frame()
    expect(root.findDescendantById("pr-info-previews")).toBeUndefined()

    panel.destroy()
    expect(root.getChildren()).toHaveLength(0)
    expect(islands.map((island) => island.isDestroyed)).toEqual([true, true, true])
  })
})
