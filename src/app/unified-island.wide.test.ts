import { test, expect, afterEach } from "bun:test"
import { WIDE_GLYPHS, WIDE_GLYPH_CONTENT, WIDE_GLYPH_RUN } from "../testing/diffs"
import { mountIsland } from "../testing/unified-island"

/*
 * A line of ideographs and an emoji at 40 columns, code from x=5. Every
 * glyph draws two cells, so whatever follows one sits a cell further right
 * than its column. A char frame drops the second cell of each, so where
 * things land is read off the frame's spans, which carry their widths.
 */

let mounted: Awaited<ReturnType<typeof mountIsland>> | null = null

afterEach(() => {
  mounted?.dispose()
  mounted = null
})

async function mount(wrap = false) {
  mounted = await mountIsland({ raw: WIDE_GLYPHS, width: 40, height: 8, wrap })
  const lineOf = (content: string) => mounted!.mapping.allLines.findIndex((line) => line.content === content)
  return { ...mounted, glyphs: lineOf(WIDE_GLYPH_CONTENT), run: lineOf(WIDE_GLYPH_RUN) }
}

const CODE_X = 5

/** The cell `char` starts in on row `y`. */
function cellOf(view: NonNullable<typeof mounted>, y: number, char: string): number {
  let x = 0
  for (const span of view.setup.captureSpans().lines[y]!.spans) {
    const at = span.text.indexOf(char)
    if (at >= 0) return x + Bun.stringWidth(span.text.slice(0, at))
    x += span.width
  }
  return -1
}

// Unified's block is the terminal's own cursor, so where it lands is read back from the renderer.
test("the block after two ideographs sits four cells in, on the x", async () => {
  const view = await mount()
  view.island.update({ cursor: { line: view.glyphs, col: 2 } })
  await view.frame()

  expect(cellOf(view, view.glyphs, "x")).toBe(CODE_X + 4)
  const { x, y, visible, style } = view.setup.renderer.getCursorState()
  expect({ x, y, visible, style }).toEqual({ x: CODE_X + 4 + 1, y: view.glyphs + 1, visible: true, style: "block" }) // the terminal counts from 1
})

test("on either unit of an emoji, the block is on the emoji's first cell", async () => {
  const view = await mount()
  for (const col of [3, 4]) {
    view.island.update({ cursor: { line: view.glyphs, col } })
    await view.frame()
    expect(view.setup.renderer.getCursorState().x).toBe(CODE_X + 5 + 1)
  }
  expect(cellOf(view, view.glyphs, "y")).toBe(CODE_X + 7)
})

// What zl runs: scroll, then pull the cursor's column into the window.
test("zl onto the second cell of an ideograph pulls the cursor to the next one, which the window shows whole", async () => {
  const view = await mount()
  for (const scrolled of [1, 2, 3]) {
    view.island.update({ cursor: { line: view.run, col: 0 } })
    view.island.resetColumns()
    await view.frame()
    view.island.scrollColumnsBy(scrolled)
    const col = view.island.clampCursorColumn(0)
    view.island.update({ cursor: { line: view.run, col } })
    await view.frame()

    expect(col).toBe(Math.ceil(scrolled / 2))
    const { x, visible } = view.setup.renderer.getCursorState()
    expect({ x, visible }).toEqual({ x: CODE_X + 2 * col - scrolled + 1, visible: true })
  }
})

test("unwrapped, a run of ideographs fills the pane to its last cell, which is the ›, and the readout counts cells", async () => {
  const view = await mount()
  view.island.update({ cursor: { line: view.run, col: 10 } })
  const rows = await view.frame()

  expect(rows[view.run]).toBe(`   2 ${"中".repeat(17)}›`)
  expect(cellOf(view, view.run, "›")).toBe(39)
  expect(view.setup.renderer.getCursorState().x).toBe(CODE_X + 20 + 1)
  expect(view.island.columnStatus()).toEqual({ col: 21, total: 100 })
})

test("wrapped, every ideograph of the run is drawn, seventeen to a 34-cell row", async () => {
  const view = await mount(true)
  const rows = await view.frame()

  expect(rows.slice(view.run, view.run + 4)).toEqual([
    `   2 ${"中".repeat(17)}`,
    `    ↳${"中".repeat(17)}`,
    `    ↳${"中".repeat(16)}`,
    "     ▸ rest of the file  ↵",
  ])
  for (const y of [view.run, view.run + 1]) expect(cellOf(view, y, "中")).toBe(CODE_X)
})
