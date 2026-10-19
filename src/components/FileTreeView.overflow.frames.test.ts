import { test, expect, describe, afterEach } from "bun:test"
import type { ScrollBoxRenderable } from "@opentui/core"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import { createFileTreeIsland, type FileTreeInput, type FileTreeIsland } from "../app/file-tree"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"

/*
 * A tree taller than its panel: twenty files at the root, under a header, on
 * a screen 8 rows tall, so the list shows 7 rows and hides 13.
 */

const modified = (path: string) => `diff --git a/${path} b/${path}
index 1111111..2222222 100644
--- a/${path}
+++ b/${path}
@@ -1,1 +1,1 @@
-a
+b
`

const NAMES = Array.from({ length: 20 }, (_, i) => `f${String(i + 1).padStart(2, "0")}.ts`)
const LONG = "a-file-name-far-too-long-for-the-panel-to-hold.ts"

const WIDTH = 35
const HEIGHT = 8
const LIST = HEIGHT - 1
/** Where the scrollbar's track ran: the last cell inside the panel's right padding. */
const RIGHT_EDGE = WIDTH - 2

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

async function mountTree(names: string[] = NAMES, height = HEIGHT) {
  const files = sortFiles(parseDiff(names.map(modified).join("")))
  const fileTree = buildFileTree(files)
  let tree!: FileTreeIsland
  mounted = await mountRenderable((renderer) => {
    tree = createFileTreeIsland(renderer, { width: WIDTH })
    return tree.host
  }, { width: WIDTH, height })
  const setup = mounted.setup
  const push = (over: Partial<FileTreeInput> = {}) =>
    tree.update({ files, fileTree, highlightIndex: 0, selectedFileIndex: null, focused: true, ...over })
  push()
  const frame = async () => (await mounted!.frame()).split("\n")
  await frame()
  const scroll = setup.renderer.root.findDescendantById("file-tree-scroll") as ScrollBoxRenderable
  /** Moves the cursor as j does: one push and one scroll into view. */
  const moveTo = (index: number) => {
    push({ highlightIndex: index })
    tree.ensureHighlightVisible()
  }
  return { tree, push, frame, setup, scroll, moveTo }
}

const SELECTED = [ints(theme.surface0), ints(theme.surface2)]

describe("a tree taller than its panel", () => {
  test("scrolled to the top, the bottom row counts what is below, and no scrollbar runs down the edge", async () => {
    const { frame, setup } = await mountTree()
    const rows = await frame()
    expect(rows).toHaveLength(HEIGHT)
    expect(rows[LIST]!.trim()).toBe("↓ 14 more")
    expect(rows.join("\n")).not.toContain("↑")
    const spans = setup.captureSpans()
    // Row 1 is the cursor row, which is surface0 across the list's width by design.
    for (let y = 2; y < HEIGHT; y++) {
      expect(SELECTED).not.toContainEqual(bgAt(spans, RIGHT_EDGE, y))
    }
  })

  test("scrolled to the middle, both edges count what lies past them", async () => {
    const { frame, moveTo } = await mountTree()
    for (let index = 1; index <= 10; index++) moveTo(index)
    const rows = await frame()
    expect(rows[1]!.trim()).toBe("↑ 6")
    expect(rows[LIST]!.trim()).toBe("↓ 9 more")
    expect(rows.slice(2, LIST).map((row) => row.trim().split(/\s+/).at(-1))).toEqual(NAMES.slice(6, 11))
  })

  test("scrolled to the end, only the top row speaks and the last file is drawn in full", async () => {
    const { frame, moveTo } = await mountTree()
    for (let index = 1; index < NAMES.length; index++) moveTo(index)
    const rows = await frame()
    expect(rows[1]!.trim()).toBe("↑ 14")
    expect(rows[LIST]).toContain("f20.ts")
    expect(rows.join("\n")).not.toContain("more")
  })

  test("stepping down one row at a time, the cursor never sits under a hint", async () => {
    const { frame, moveTo, setup } = await mountTree()
    for (let index = 0; index < NAMES.length; index++) {
      moveTo(index)
      const rows = await frame()
      const y = rows.findIndex((row) => row.includes(NAMES[index]!))
      expect(y).toBeGreaterThan(0)
      expect(bgAt(setup.captureSpans(), 10, y)).toEqual(ints(theme.surface0))
      if (rows[LIST]!.includes("more")) expect(y).toBeLessThan(LIST)
      if (rows[1]!.includes("↑")) expect(y).toBeGreaterThan(1)
    }
  })

  test("and stepping back up, the same holds on the top edge", async () => {
    const { frame, moveTo } = await mountTree()
    moveTo(NAMES.length - 1)
    for (let index = NAMES.length - 1; index >= 0; index--) {
      moveTo(index)
      const rows = await frame()
      const y = rows.findIndex((row) => row.includes(NAMES[index]!))
      expect(y).toBeGreaterThan(0)
      if (rows[1]!.includes("↑")) expect(y).toBeGreaterThan(1)
      if (rows[LIST]!.includes("more")) expect(y).toBeLessThan(LIST)
    }
  })

  test("a wheel scroll redraws the hints without a push", async () => {
    const { frame, setup } = await mountTree()
    await frame()
    await setup.mockMouse.scroll(10, 4, "down")
    const rows = await frame()
    const top = rows.findIndex((row) => row.includes("↑"))
    expect(top).toBe(1)
    const covered = Number(rows[1]!.trim().slice(2))
    expect(rows[LIST]!.trim()).toBe(`↓ ${NAMES.length - (covered - 1) - LIST + 1} more`)
  })
})

describe("the hint rows' shades", () => {
  test("the glyphs are overlay0 and the whole row is mantle, padding included", async () => {
    const { frame, setup, moveTo } = await mountTree()
    moveTo(10)
    const rows = await frame()
    const spans = setup.captureSpans()
    for (const y of [1, LIST]) {
      for (let x = 0; x < WIDTH; x++) expect(bgAt(spans, x, y)).toEqual(ints(theme.mantle))
      const glyph = rows[y]!.search(/[↑↓]/)
      expect(fgAt(spans, glyph, y)).toEqual(ints(theme.overlay0))
    }
  })

  test("a hint over the cursor row hides its surface0", async () => {
    const { frame, setup, push, scroll } = await mountTree()
    push({ highlightIndex: 5 })
    scroll.scrollTop = 5
    const rows = await frame()
    expect(rows[1]!.trim()).toBe("↑ 6")
    const spans = setup.captureSpans()
    for (let x = 0; x < WIDTH; x++) expect(bgAt(spans, x, 1)).toEqual(ints(theme.mantle))
  })
})

describe("a tree that fits", () => {
  test("draws every row and no hint", async () => {
    const rows = await (await mountTree(NAMES.slice(0, 5))).frame()
    expect(rows).toEqual(["  Files (0/5)", ...NAMES.slice(0, 5).map((name) => ` ○ M   ${name}`)])
  })
})

describe("width", () => {
  test("a long name runs to the panel's right padding, its ellipsis in the cell the scrollbar used to take", async () => {
    const rows = await (await mountTree([LONG])).frame()
    const row = rows.find((r) => r.includes("a-file-name"))!
    expect(row).toBe(` ○ M   ${LONG.slice(0, 26)}…`)
    expect(row.length).toBe(RIGHT_EDGE + 1)
  })
})
