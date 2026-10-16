import { describe, expect, test } from "bun:test"
import type { DiffLine, DiffLineType } from "../vim-diff/types"
import { LONG_LINE, code, diffFile, doc, long, mappingOf } from "./fixtures"
import { buildRows } from "./rows"
import { buildVisualRows, lineWrapper } from "./visual-rows"

const unifiedOf = (files = [long, code]) => {
  const lines = mappingOf({}, files).allLines
  return { lines, rows: buildRows(lines, "unified") }
}

const longRow = (lines: readonly DiffLine[]) => lines.findIndex((line) => line.content === LONG_LINE)

const lineOf = (type: DiffLineType, content: string, visualIndex: number): DiffLine => ({
  visualIndex,
  type,
  content,
  rawLine: content,
})

describe("lineWrapper", () => {
  test("hands back the same slices for a line at a width it has wrapped before", () => {
    const { lines } = unifiedOf()
    const at = longRow(lines)
    const wrapper = lineWrapper(lines)

    const slices = wrapper(at, 55)
    expect(slices).toHaveLength(2)
    expect(wrapper(at, 55)).toBe(slices)
    expect(wrapper(at, 200)).not.toBe(slices)
    expect(wrapper(at, 200)).toHaveLength(1)
  })

  test("leaves riff's own rows, and a line past the end, unwrapped", () => {
    const lines = mappingOf({}, [doc, code]).allLines
    const wrapper = lineWrapper(lines)
    const chrome = ["file-header", "divider", "spacing"] as const

    for (const type of chrome) {
      const at = lines.findIndex((line) => line.type === type)
      expect(at).toBeGreaterThanOrEqual(0)
      expect(wrapper(at, 10)).toBeNull()
    }
    expect(wrapper(lines.length, 10)).toBeNull()
  })
})

describe("buildVisualRows", () => {
  test("a wrapped line takes a row per slice and pushes every row below it down", () => {
    const { lines, rows } = unifiedOf()
    const at = longRow(lines)
    const visual = buildVisualRows(rows, lines, { wrap: true, widthOf: () => 55 })

    expect(visual.total).toBe(rows.length + 1)
    expect(visual.heightOf(at)).toBe(2)
    expect(visual.firstOf(at)).toBe(at)
    expect(visual.firstOf(at + 1)).toBe(at + 2)
    expect(visual.firstOf(rows.length)).toBe(visual.total)
  })

  test("at() finds the row on either side of a wrapped line's slices", () => {
    const { lines, rows } = unifiedOf()
    const at = longRow(lines)
    const visual = buildVisualRows(rows, lines, { wrap: true, widthOf: () => 55 })

    expect(visual.at(0)).toEqual({ row: 0, slice: null, continuation: false })
    expect(visual.at(at - 1)).toMatchObject({ row: at - 1, continuation: false })
    expect(visual.at(at)).toMatchObject({ row: at, slice: { startCol: 0 }, continuation: false })
    const second = visual.at(at + 1)
    expect(second).toMatchObject({ row: at, continuation: true })
    expect(LONG_LINE.slice(second.slice!.startCol)).toStartWith("a fairly")
    expect(visual.at(at + 2)).toMatchObject({ row: at + 1, continuation: false })
    expect(visual.at(visual.total - 1).row).toBe(rows.length - 1)
  })

  describe("ofColumn", () => {
    // Read off OpenTUI's own word wrap at width 18, where a 30-cell line takes two rows.
    const lines = [
      lineOf("context", "short", 0),
      lineOf("addition", "a".repeat(30), 1),
      lineOf("context", "mid line", 2),
      lineOf("deletion", "bb", 3),
      lineOf("divider", "rest of the file", 4),
    ]
    const visual = buildVisualRows(buildRows(lines, "unified"), lines, { wrap: true, widthOf: () => 18 })
    const placed = (row: number, col: number) => {
      const { visual: at, slice } = visual.ofColumn(row, col)
      return { visual: at, startCol: slice?.startCol ?? 0 }
    }

    test("keeps a column on the row that draws it", () => {
      expect(placed(1, 0)).toEqual({ visual: 1, startCol: 0 })
      expect(placed(1, 17)).toEqual({ visual: 1, startCol: 0 })
      expect(placed(1, 18)).toEqual({ visual: 2, startCol: 18 })
      expect(placed(1, 29)).toEqual({ visual: 2, startCol: 18 })
    })

    test("holds the last row for a column past the end of the line", () => {
      expect(placed(1, 400)).toEqual({ visual: 2, startCol: 18 })
    })

    test("puts unwrapped lines on their own single row", () => {
      expect(placed(0, 3)).toEqual({ visual: 0, startCol: 0 })
      expect(placed(3, 1)).toEqual({ visual: 4, startCol: 0 })
    })

    test("falls back to one row per line with wrap off", () => {
      const { lines, rows } = unifiedOf()
      const off = buildVisualRows(rows, lines, { wrap: false, widthOf: () => 18 })
      expect(off.ofColumn(7, 120)).toEqual({ visual: 7, slice: null })
    })

    test("falls back for a row that does not wrap", () => {
      expect(visual.ofColumn(4, 4)).toEqual({ visual: 5, slice: null })
    })

    test("places a row past the end where firstOf puts it, one past the last visual row", () => {
      expect(visual.ofColumn(99, 0)).toEqual({ visual: visual.total, slice: null })
      expect(visual.firstOf(99)).toBe(visual.total)
    })

    const oneLine = (content: string) => {
      const single = [lineOf("context", content, 0)]
      const rows = buildVisualRows(buildRows(single, "unified"), single, { wrap: true, widthOf: () => 6 })
      return (col: number) => rows.ofColumn(0, col).visual
    }

    test("moves whitespace hanging past the edge to the next row, where it can be shown", () => {
      // "aaa   " fills the row; the three spaces after it hang there undrawn.
      const placedIn = oneLine("aaa      bbb")
      expect([0, 5].map(placedIn)).toEqual([0, 0])
      expect([6, 7, 8, 9, 11].map(placedIn)).toEqual([1, 1, 1, 1, 1])
    })

    test("counts a tab as the cells it draws in", () => {
      // "abcd" and the first tab fill the row's six cells; the second tab hangs past the edge.
      const placedIn = oneLine("abcd\t\tef")
      expect([0, 4].map(placedIn)).toEqual([0, 0])
      expect([5, 6, 7].map(placedIn)).toEqual([1, 1, 1])
    })
  })

  test("hunk headers wrap; file headers, dividers, spacing and split's pairs stay one row", () => {
    const narrow = { wrap: true, widthOf: () => 6 }
    const chrome = [
      lineOf("file-header", "a/very/long/path/to/a/file.ts", 0),
      lineOf("hunk-header", "@@ -1,5 +1,6 @@ function", 1),
      lineOf("divider", "rest of the file", 2),
      lineOf("spacing", "", 3),
    ]
    const visual = buildVisualRows(buildRows(chrome, "unified"), chrome, narrow)
    expect([0, 1, 2, 3].map(visual.heightOf)).toEqual([1, 5, 1, 1])

    const { lines } = unifiedOf()
    const split = buildRows(lines, "split")
    const inSplit = buildVisualRows(split, lines, narrow)
    const pairs = split.flatMap((row, index) => (row.kind === "pair" ? [index] : []))
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs.map(inSplit.heightOf)).toEqual(pairs.map(() => 1))
  })

  test("at() reports no row when there are none", () => {
    for (const wrap of [true, false]) {
      const empty = buildVisualRows([], [], { wrap, widthOf: () => 18 })
      expect(empty.total).toBe(0)
      expect(empty.at(0)).toEqual({ row: -1, slice: null, continuation: false })
    }
  })

  test("wrap off is the identity", () => {
    const { lines, rows } = unifiedOf()
    const visual = buildVisualRows(rows, lines, { wrap: false, widthOf: () => 6 })

    expect(visual.total).toBe(rows.length)
    rows.forEach((_, row) => {
      expect(visual.firstOf(row)).toBe(row)
      expect(visual.heightOf(row)).toBe(1)
      expect(visual.at(row)).toEqual({ row, slice: null, continuation: false })
      expect(visual.slicesOf(row)).toBeNull()
    })
  })

  test("each line wraps at its own section's width", () => {
    const wide = diffFile("wide.ts", ["@@ -1,2 +1,3 @@", " {", `+${LONG_LINE}`, " }"])
    const { lines, rows } = unifiedOf([long, wide])
    const visual = buildVisualRows(rows, lines, {
      wrap: true,
      widthOf: (index) => (lines[index]!.filename === long.filename ? 55 : 200),
    })
    const [inLong, inWide] = rows.flatMap((row, index) => (lines[index]!.content === LONG_LINE ? [index] : []))

    expect(visual.slicesOf(inLong!)).toHaveLength(2)
    expect(visual.slicesOf(inWide!)).toHaveLength(1)
  })
})
