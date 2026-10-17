import { describe, expect, test } from "bun:test"
import { cellOfColumn, cellsOf, columnOfCell, graphemeCells, wholeColumns } from "./cells"

describe("graphemeCells", () => {
  test("wide glyphs are two cells, a tab two, a zero-width space none", () => {
    expect(["中", "Ａ", "😀", "❤\ufe0f", "🇨🇭", "\t"].map(graphemeCells)).toEqual([2, 2, 2, 2, 2, 2])
    expect(["a", "e\u0301", "ｱ", "→", "✓"].map(graphemeCells)).toEqual([1, 1, 1, 1, 1])
    expect(graphemeCells("\u200b")).toBe(0)
  })
})

describe("cellOfColumn and columnOfCell", () => {
  test("a CJK ideograph between two letters", () => {
    const line = "a中b"
    expect([0, 1, 2, 3].map((column) => cellOfColumn(line, column))).toEqual([0, 1, 3, 4])
    expect([0, 1, 2, 3, 4].map((cell) => columnOfCell(line, cell))).toEqual([0, 1, 1, 2, 3])
  })

  test("an emoji: a column on its low surrogate is its first cell, either of its cells its first column", () => {
    const line = "x😀y"
    expect([0, 1, 2, 3, 4].map((column) => cellOfColumn(line, column))).toEqual([0, 1, 1, 3, 4])
    expect([0, 1, 2, 3].map((cell) => columnOfCell(line, cell))).toEqual([0, 1, 1, 3])
  })

  test("a combining mark draws in the cell of the letter it sits on", () => {
    const line = "e\u0301z"
    expect([0, 1, 2, 3].map((column) => cellOfColumn(line, column))).toEqual([0, 0, 1, 2])
    expect([0, 1, 2].map((cell) => columnOfCell(line, cell))).toEqual([0, 2, 3])
  })

  test("a tab before an ideograph", () => {
    const line = "a\t中"
    expect([0, 1, 2, 3].map((column) => cellOfColumn(line, column))).toEqual([0, 1, 3, 5])
    expect([0, 1, 2, 3, 4, 5].map((cell) => columnOfCell(line, cell))).toEqual([0, 1, 1, 2, 2, 3])
    expect(cellsOf(line)).toBe(5)
  })

  test("past the end, a cell for each column", () => {
    expect(cellOfColumn("中", 3)).toBe(4)
    expect(columnOfCell("中", 4)).toBe(3)
    expect(cellOfColumn("", 2)).toBe(2)
  })

  test("a pure-ASCII line counts a cell a unit, but a tab", () => {
    expect(cellOfColumn("a\tb", 2)).toBe(3)
    expect(columnOfCell("a\tb", 2)).toBe(1)
  })
})

describe("wholeColumns", () => {
  test("a window that starts on an ideograph's second cell starts at the next ideograph", () => {
    expect(wholeColumns("中中中", 1, 5)).toEqual({ startCol: 1, endCol: 3 })
  })

  test("a window that ends on an ideograph's first cell ends before it", () => {
    expect(wholeColumns("中中中", 0, 4)).toEqual({ startCol: 0, endCol: 2 })
    expect(wholeColumns("中中中", 1, 4)).toEqual({ startCol: 1, endCol: 2 })
  })

  test("a window inside a single ideograph holds nothing", () => {
    const { startCol, endCol } = wholeColumns("中中中", 1, 2)
    expect(endCol).toBe(startCol)
  })

  test("a window narrower than nothing is empty", () => {
    const { startCol, endCol } = wholeColumns("abc", 2, 1)
    expect(endCol).toBe(startCol)
  })

  test("on ASCII and past the end, the columns columnOfCell gives", () => {
    for (const [content, first, last] of [
      ["abcdef", 2, 4],
      ["a\tb", 1, 2],
      ["abc", 2, 6],
      ["中", 3, 5],
      ["", 1, 3],
    ] as const) {
      expect(wholeColumns(content, first, last)).toEqual({
        startCol: columnOfCell(content, first),
        endCol: columnOfCell(content, last) + 1,
      })
    }
  })
})
