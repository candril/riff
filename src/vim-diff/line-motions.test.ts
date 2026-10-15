import { test, expect, describe } from "bun:test"
import type { LineSource } from "./line-source"
import type { DiffLine, DiffLineType } from "./types"
import {
  findCharInLine,
  findFileHeader,
  findFirstNonSpace,
  findHunk,
  findWordBoundary,
  searchLines,
} from "./line-motions"

// A plain array, not DiffLineMapping: the motions must need nothing but the interface.
function linesOf(rows: [DiffLineType, string][]): LineSource {
  const lines: DiffLine[] = rows.map(([type, content], visualIndex) => ({
    visualIndex,
    type,
    content,
    rawLine: content,
  }))
  return {
    lineCount: lines.length,
    getLine: (index) => lines[index],
    getLineContent: (index) => lines[index]?.content ?? "",
    findVisualLineForFileLine: () => null,
  }
}

/**
 *  0 file-header  a.ts
 *  1 context      function run() {
 *  2 deletion       old
 *  3 addition       new
 *  4 context        keep
 *  5 addition       more
 *  6 context      }
 *  7 spacing
 *  8 file-header  b.ts
 *  9 context      foo.bar(baz)
 * 10 context      (blank, all spaces)
 * 11 context      Next line
 */
const source = linesOf([
  ["file-header", "a.ts"],
  ["context", "function run() {"],
  ["deletion", "  old"],
  ["addition", "  new"],
  ["context", "  keep"],
  ["addition", "  more"],
  ["context", "}"],
  ["spacing", ""],
  ["file-header", "b.ts"],
  ["context", "foo.bar(baz)"],
  ["context", "    "],
  ["context", "Next line"],
])

describe("findHunk", () => {
  test("next skips the rest of the current change block", () => {
    expect(findHunk(source, 2, "next")).toBe(5)
    expect(findHunk(source, 0, "next")).toBe(2)
  })

  test("prev lands on the first line of the previous block", () => {
    expect(findHunk(source, 5, "prev")).toBe(2)
    expect(findHunk(source, 11, "prev")).toBe(5)
  })

  test("null past the last or before the first block", () => {
    expect(findHunk(source, 5, "next")).toBeNull()
    expect(findHunk(source, 3, "prev")).toBeNull()
  })
})

describe("findFileHeader", () => {
  test("finds the header in both directions", () => {
    expect(findFileHeader(source, 0, "next")).toBe(8)
    expect(findFileHeader(source, 10, "prev")).toBe(8)
    expect(findFileHeader(source, 8, "prev")).toBe(0)
  })

  test("null at the edge", () => {
    expect(findFileHeader(source, 8, "next")).toBeNull()
    expect(findFileHeader(source, 0, "prev")).toBeNull()
  })
})

describe("searchLines", () => {
  test("wraps around forward", () => {
    expect(searchLines(source, "run", 5, "forward")).toEqual({ line: 1, col: 9, length: 3 })
  })

  test("wraps around backward", () => {
    expect(searchLines(source, "next", 2, "backward")).toEqual({ line: 11, col: 0, length: 4 })
  })

  test("escapes a literal string instead of reading it as a regex", () => {
    expect(searchLines(source, ".bar(", 0, "forward")).toEqual({ line: 9, col: 3, length: 5 })
    expect(searchLines(source, "o.d", 0, "forward")).toBeNull()
  })

  test("ignores case for a string pattern", () => {
    expect(searchLines(source, "FUNCTION", 0, "forward")).toEqual({ line: 1, col: 0, length: 8 })
  })
})

describe("findCharInLine", () => {
  test("f and t move forward, t stops one short", () => {
    expect(findCharInLine(source, 9, 0, "(", "f")).toBe(7)
    expect(findCharInLine(source, 9, 0, "(", "t")).toBe(6)
  })

  test("F and T move backward, T stops one short", () => {
    expect(findCharInLine(source, 9, 11, ".", "F")).toBe(3)
    expect(findCharInLine(source, 9, 11, ".", "T")).toBe(4)
  })

  test("null when the char is not on the line", () => {
    expect(findCharInLine(source, 9, 0, "#", "f")).toBeNull()
  })
})

describe("findFirstNonSpace", () => {
  test("skips indentation", () => {
    expect(findFirstNonSpace(source, 2)).toBe(2)
  })

  test("0 on an all-blank line", () => {
    expect(findFirstNonSpace(source, 10)).toBe(0)
  })
})

describe("findWordBoundary", () => {
  test("w moves to the next word or punctuation run", () => {
    expect(findWordBoundary(source, 9, 0, "forward", "w")).toEqual({ line: 9, col: 3 })
    expect(findWordBoundary(source, 9, 3, "forward", "w")).toEqual({ line: 9, col: 4 })
  })

  test("W treats punctuation as part of the word", () => {
    expect(findWordBoundary(source, 1, 0, "forward", "W")).toEqual({ line: 1, col: 9 })
  })

  test("w crosses blank lines to the next line's first word", () => {
    expect(findWordBoundary(source, 9, 11, "forward", "w")).toEqual({ line: 11, col: 0 })
  })

  test("e moves to the end of the word", () => {
    expect(findWordBoundary(source, 9, 0, "forward", "e")).toEqual({ line: 9, col: 2 })
  })

  test("e crosses to the next line", () => {
    expect(findWordBoundary(source, 2, 4, "forward", "e")).toEqual({ line: 3, col: 4 })
  })

  test("b moves to the start of the previous word", () => {
    expect(findWordBoundary(source, 9, 6, "backward", "b")).toEqual({ line: 9, col: 4 })
  })

  test("b crosses back to the previous line", () => {
    expect(findWordBoundary(source, 3, 2, "backward", "b")).toEqual({ line: 2, col: 2 })
  })
})
