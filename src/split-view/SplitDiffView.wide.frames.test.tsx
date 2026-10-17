import { test, expect, afterEach } from "bun:test"
import { WIDE_GLYPHS } from "../testing/diffs"
import { bgAt, ints, mountSplit, type MountSplitOptions } from "../testing/split-frame"
import { theme } from "../theme"

/*
 * WIDE_GLYPHS in split at 122 columns, which leaves each pane 54 cells of
 * code, an even number for a run of ideographs: the right pane's code
 * starts at x=67. A char frame drops the second cell of a wide glyph, so where
 * things land is read off the frame's spans, which carry their widths.
 */

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

async function mount(options: Partial<MountSplitOptions>) {
  mounted = await mountSplit({ raw: WIDE_GLYPHS, width: 122, height: 8, ...options })
  return mounted
}

const GLYPHS_ROW = 1
const RUN_ROW = 2
const CODE_X = 67

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

test("scrolled into the middle of an ideograph, its half in view is a space and the rest keeps its cells", async () => {
  // Column 2 puts the ‹ on the second ideograph's first cell, so the window starts on its second.
  const view = await mount({ columns: { left: 0, right: 2 } })
  const rows = (await view.frame()).split("\n")

  expect(rows[GLYPHS_ROW]!.slice(61)).toBe("    1 ‹ x😀y = 1")
  expect(cellOf(view, GLYPHS_ROW, "‹")).toBe(CODE_X)
  expect(cellOf(view, GLYPHS_ROW, "x")).toBe(CODE_X + 2)
  expect(cellOf(view, GLYPHS_ROW, "y")).toBe(CODE_X + 5)
  expect(rows[RUN_ROW]!.slice(61)).toBe(`    2 ‹ ${"中".repeat(26)}›`)
  expect(cellOf(view, RUN_ROW, "›")).toBe(121)
  expect(rows[GLYPHS_ROW]!.slice(0, 61).trimEnd()).toBe("    1 old = 0")
})

test("a window ending in the middle of an ideograph leaves its half a space before the ›", async () => {
  const view = await mount({ columns: { left: 0, right: 1 } })
  const rows = (await view.frame()).split("\n")

  // ‹ on cell 1, the run's cells 2 to 54 shown, and the › on 55: the ideograph on 54 and 55 shows its first half.
  expect(rows[RUN_ROW]!.slice(61)).toBe(`    2 ‹${"中".repeat(26)} ›`)
  expect(cellOf(view, RUN_ROW, "›")).toBe(121)
})

test("the cursor on an emoji is a block over both its cells", async () => {
  const view = await mount({ cursor: { row: GLYPHS_ROW, col: 3 } })
  await view.frame()
  const spans = view.setup.captureSpans()

  expect(bgAt(spans, CODE_X + 4, GLYPHS_ROW)).not.toEqual(ints(theme.rosewater))
  expect(bgAt(spans, CODE_X + 5, GLYPHS_ROW)).toEqual(ints(theme.rosewater))
  expect(bgAt(spans, CODE_X + 6, GLYPHS_ROW)).toEqual(ints(theme.rosewater))
  expect(bgAt(spans, CODE_X + 7, GLYPHS_ROW)).not.toEqual(ints(theme.rosewater))
})

test("a flash label on an ideograph takes both its cells, so the rest of the row stays put", async () => {
  // Mapping line 2 is the glyphs' addition, drawn on GLYPHS_ROW.
  const view = await mount({ flash: [{ line: 2, startCol: 1, endCol: 2, label: "s" }] })
  const rows = (await view.frame()).split("\n")
  const spans = view.setup.captureSpans()

  expect(rows[GLYPHS_ROW]!.slice(61)).toBe("    1 中s x😀y = 1")
  expect(bgAt(spans, CODE_X + 2, GLYPHS_ROW)).toEqual(ints(theme.red))
  expect(bgAt(spans, CODE_X + 3, GLYPHS_ROW)).toEqual(ints(theme.red))
  expect(cellOf(view, GLYPHS_ROW, "x")).toBe(CODE_X + 4)
})
