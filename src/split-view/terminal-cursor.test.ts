import { test, expect, describe } from "bun:test"
import { buildRows } from "../diff-rows/rows"
import { buildVisualRows, lineWrapper } from "../diff-rows/visual-rows"
import { MANY_WRAPPED_LINES, MIXED_DIGITS, ONE_WIDE_LINE, TWO_FILES } from "../testing/diffs"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { FILE_LABEL_PATH_X } from "./FullRow"
import { unifiedOrigins, unifiedWrapWidth } from "./layout"
import { unifiedCursorCell } from "./terminal-cursor"

const TAB_AND_ASTRAL = `diff --git a/odd.ts b/odd.ts
index 1111111..2222222 100644
--- a/odd.ts
+++ b/odd.ts
@@ -1 +1 @@
-\tx = 1
+😀!
`

interface Where {
  col?: number
  scrollTop?: number
  height?: number
  column?: number
  wrap?: boolean
  width?: number
}

/** The rule's input for a line of `raw`, its geometry worked out as UnifiedDiffView works it out. */
function at(raw: string, lineIndex: number, { col = 0, scrollTop = 0, height = 20, column = 0, wrap = false, width = 80 }: Where = {}) {
  const mapping = new DiffLineMapping(parseDiff(raw), "all")
  const wrapper = lineWrapper(mapping.allLines)
  const originOf = unifiedOrigins(mapping, wrap ? width : undefined, wrapper)
  const visual = buildVisualRows(buildRows(mapping.allLines, "unified"), mapping.allLines, {
    wrap,
    widthOf: (index) => unifiedWrapWidth(width, originOf(index)),
    wrapper,
  })
  const input = {
    line: mapping.getLine(lineIndex),
    lineIndex,
    col,
    scrollTop,
    height,
    column,
    origin: originOf(lineIndex),
    rowWidth: width,
    visual,
  }
  return { input, mapping, visual }
}

const cellAt = (raw: string, lineIndex: number, where?: Where) => unifiedCursorCell(at(raw, lineIndex, where).input)

const lineOf = (raw: string, content: string) =>
  new DiffLineMapping(parseDiff(raw), "all").allLines.findIndex((line) => line.content === content)

// TWO_FILES's code starts at x=5; line 0 is greet.ts's header, line 4 its `}`.
describe("unifiedCursorCell", () => {
  test("a plain line at column 0 is the code's first cell, on the line's row", () => {
    expect(cellAt(TWO_FILES, 4)).toEqual({ x: 5, y: 4 })
  })

  describe("scrolled sideways", () => {
    const WIDE = 3
    test("a cursor left of the window is hidden", () => {
      expect(cellAt(ONE_WIDE_LINE, WIDE, { column: 100, col: 99 })).toBeNull()
    })

    test("a cursor in the window is offset by the scroll", () => {
      expect(cellAt(ONE_WIDE_LINE, WIDE, { column: 100, col: 100 })).toEqual({ x: 5, y: WIDE })
      expect(cellAt(ONE_WIDE_LINE, WIDE, { column: 100, col: 120 })).toEqual({ x: 25, y: WIDE })
    })

    test("a cursor at the row's width or past it is hidden", () => {
      expect(cellAt(ONE_WIDE_LINE, WIDE, { column: 100, col: 174 })).toEqual({ x: 79, y: WIDE })
      expect(cellAt(ONE_WIDE_LINE, WIDE, { column: 100, col: 175 })).toBeNull()
      expect(cellAt(ONE_WIDE_LINE, WIDE, { column: 100, col: 174, width: 79 })).toBeNull()
    })
  })

  test("a file with a wider gutter starts the cursor at its own origin", () => {
    expect(cellAt(MIXED_DIGITS, lineOf(MIXED_DIGITS, "const a = 1"), { col: 2 })).toMatchObject({ x: 5 + 2 })
    const far = lineOf(MIXED_DIGITS, "const c = 1")
    expect(cellAt(MIXED_DIGITS, far, { col: 2 })).toEqual({ x: 6 + 2, y: far })
  })

  test("wrapped, a cursor on a continuation sits on that slice's row, from the code's origin", () => {
    const where = { wrap: true, width: 120 }
    const { input, visual } = at(MANY_WRAPPED_LINES, 2, where)
    const continuation = visual.slicesOf(2)![1]!
    // Header, then two rows for line 1: line 2's second slice is row 4.
    expect(cellAt(MANY_WRAPPED_LINES, 2, { ...where, col: continuation.startCol + 3 })).toEqual({
      x: input.origin + 3,
      y: 4,
    })
    expect(cellAt(MANY_WRAPPED_LINES, 2, { ...where, col: continuation.startCol + 3, scrollTop: 3 })).toEqual({
      x: input.origin + 3,
      y: 1,
    })
    // Sideways scrolling is a view on unwrapped lines only.
    expect(cellAt(MANY_WRAPPED_LINES, 2, { ...where, col: 0, column: 40 })).toEqual({ x: input.origin, y: 3 })
  })

  test("scrolled off the top or past the bottom, it is hidden", () => {
    expect(cellAt(TWO_FILES, 4, { scrollTop: 5 })).toBeNull()
    expect(cellAt(TWO_FILES, 4, { scrollTop: 4 })).toEqual({ x: 5, y: 0 })
    expect(cellAt(TWO_FILES, 4, { height: 4 })).toBeNull()
    expect(cellAt(TWO_FILES, 4, { height: 5 })).toEqual({ x: 5, y: 4 })
  })

  test("on a file header it goes on the path, a column past it clamped to the last character", () => {
    expect(cellAt(TWO_FILES, 0, { col: 4 })).toEqual({ x: 5 + 4, y: 0 })
    expect(cellAt(TWO_FILES, 0, { col: 50 })).toEqual({ x: 5 + "src/greet.ts".length - 1, y: 0 })
    // The label never scrolls sideways, so neither does the cursor on it.
    expect(cellAt(TWO_FILES, 0, { col: 4, column: 30 })).toEqual({ x: 5 + 4, y: 0 })
  })

  test("on a header beside a wider gutter it goes on the path, not the code's origin", () => {
    const header = new DiffLineMapping(parseDiff(MIXED_DIGITS), "all").allLines.findIndex(
      (line) => line.type === "file-header" && line.filename === "far.ts"
    )
    expect(at(MIXED_DIGITS, header).input.origin).toBe(6)
    expect(cellAt(MIXED_DIGITS, header, { col: 0 })).toEqual({ x: FILE_LABEL_PATH_X, y: header })
    expect(cellAt(MIXED_DIGITS, header, { col: 3 })).toEqual({ x: FILE_LABEL_PATH_X + 3, y: header })
  })

  test("on a legacy hunk header, which the mapping no longer emits, it scrolls sideways with the code", () => {
    // The mapping no longer builds hunk headers, so one stands in for TWO_FILES's line 1.
    const onHunk = (where: Where) => {
      const { input } = at(TWO_FILES, 1, where)
      return unifiedCursorCell({ ...input, line: { ...input.line!, type: "hunk-header", content: "@@ -1,5 +1,5 @@" } })
    }
    expect(onHunk({ col: 5, column: 3 })).toEqual({ x: 5 + 5 - 3, y: 1 })
    expect(onHunk({ col: 2, column: 3 })).toBeNull()
  })

  test("on a divider it stays at the code's origin, however far the code is scrolled", () => {
    const divider = new DiffLineMapping(parseDiff(TWO_FILES), "all").allLines.findIndex((line) => line.type === "divider")
    expect(cellAt(TWO_FILES, divider, { column: 30 })).toEqual({ x: 5, y: divider })
  })

  test("a tab or a character outside the BMP is counted in the cells it draws", () => {
    const deletion = lineOf(TAB_AND_ASTRAL, "\tx = 1")
    const addition = lineOf(TAB_AND_ASTRAL, "😀!")
    // The tab draws two cells, the emoji one for its two UTF-16 units.
    expect(cellAt(TAB_AND_ASTRAL, deletion, { col: 1 })).toMatchObject({ x: 5 + 2 })
    expect(cellAt(TAB_AND_ASTRAL, addition, { col: 2 })).toMatchObject({ x: 5 + 1 })
  })
})
