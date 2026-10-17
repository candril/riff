import { describe, expect, test } from "bun:test"
import { LONG_LINE } from "./fixtures"
import { wrapLine } from "./wrap"

const starts = (content: string, width: number) => wrapLine(content, width).map((slice) => slice.startCol)
const texts = (content: string, width: number) =>
  wrapLine(content, width).map((slice) => content.slice(slice.startCol, slice.endCol))

describe("wrapLine", () => {
  test("an empty line is one empty slice", () => {
    expect(wrapLine("", 10)).toEqual([{ startCol: 0, endCol: 0, startCell: 0, cells: 0 }])
  })

  test("a width of zero or less leaves the line whole", () => {
    expect(wrapLine("a\tlong line", 0)).toEqual([{ startCol: 0, endCol: 11, startCell: 0, cells: 12 }])
    expect(wrapLine("abc", -3)).toEqual([{ startCol: 0, endCol: 3, startCell: 0, cells: 3 }])
  })

  test("a line that fits is one slice, up to exactly the width", () => {
    expect(wrapLine("abcdef", 6)).toEqual([{ startCol: 0, endCol: 6, startCell: 0, cells: 6 }])
    expect(texts("abcdefg", 6)).toEqual(["abcdef", "g"])
  })

  test("breaks after the last whitespace that fits", () => {
    expect(texts("aaa bbb ccc ddd eee fff ggg hhh iii", 12)).toEqual(["aaa bbb ccc ", "ddd eee fff ", "ggg hhh iii"])
  })

  test("breaks after punctuation too", () => {
    expect(texts("a.b.c(d,e)-f/g_h:i;j k", 12)).toEqual(["a.b.c(d,e)-", "f/g_h:i;j k"])
    expect(texts("foo(bar, baz)", 6)).toEqual(["foo(", "bar, ", "baz)"])
  })

  test("does not break after an underscore, quote or operator", () => {
    expect(texts("aaaaa_bbbbbbbbbbbb", 8)).toEqual(["aaaaa_bb", "bbbbbbbb", "bb"])
    expect(texts('aaaaa"bbbbbbbbbbbb', 8)).toEqual(['aaaaa"bb', "bbbbbbbb", "bb"])
    expect(texts("aaaaa=bbbbbbbbbbbb", 8)).toEqual(["aaaaa=bb", "bbbbbbbb", "bb"])
  })

  test("cuts a word longer than the row at the edge", () => {
    expect(starts("x".repeat(30), 12)).toEqual([0, 12, 24])
    expect(texts("ab abcdefghij", 4)).toEqual(["ab ", "abcd", "efgh", "ij"])
  })

  test("whitespace past the edge hangs on the row it ends, and is not drawn", () => {
    expect(wrapLine("aaa      bbb", 6)).toEqual([
      { startCol: 0, endCol: 9, startCell: 0, cells: 6 },
      { startCol: 9, endCol: 12, startCell: 9, cells: 3 },
    ])
    expect(wrapLine("aaa  ", 3)).toEqual([{ startCol: 0, endCol: 5, startCell: 0, cells: 3 }])
  })

  test("indentation wider than the row is cut like a word", () => {
    expect(texts("        x", 4)).toEqual(["    ", "    ", "x"])
    expect(texts("   leading indent words", 8)).toEqual(["   ", "leading ", "indent ", "words"])
  })

  test("a tab is as wide as TAB, and one that would cross the edge is not drawn", () => {
    expect(wrapLine("a\tb\tc\td\te\tf\tg\th\ti", 12).map((slice) => slice.cells)).toEqual([12, 12, 1])
    expect(wrapLine("aa-- \t\t ", 8)).toEqual([{ startCol: 0, endCol: 8, startCell: 0, cells: 7 }])
  })

  test("a tab wider than the whole row still takes a row of its own", () => {
    expect(wrapLine("\t.", 1)).toEqual([
      { startCol: 0, endCol: 1, startCell: 0, cells: 2 },
      { startCol: 1, endCol: 2, startCell: 2, cells: 1 },
    ])
  })

  test("a wide glyph that does not fit in the cells left opens the next row", () => {
    const line = "abc😀def"
    expect(wrapLine(line, 4)).toEqual([
      { startCol: 0, endCol: 3, startCell: 0, cells: 3 },
      { startCol: 3, endCol: 7, startCell: 3, cells: 4 },
      { startCol: 7, endCol: 8, startCell: 7, cells: 1 },
    ])
  })

  test("a run of ideographs is cut at the last glyph that fits, leaving an odd cell empty", () => {
    expect(wrapLine("中文字符串", 5)).toEqual([
      { startCol: 0, endCol: 2, startCell: 0, cells: 4 },
      { startCol: 2, endCol: 4, startCell: 4, cells: 4 },
      { startCol: 4, endCol: 5, startCell: 8, cells: 2 },
    ])
  })

  test("unified's long line breaks after the first \"keeps going \" at a code width of 55", () => {
    const slices = wrapLine(LONG_LINE, 55)
    expect(slices).toHaveLength(2)
    expect(LONG_LINE.slice(slices[0]!.startCol, slices[0]!.endCol)).toEndWith("keeps going ")
    expect(LONG_LINE.slice(slices[1]!.startCol)).toStartWith("a fairly")
  })
})
