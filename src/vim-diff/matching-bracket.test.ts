import { describe, expect, test } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { bracketFrom, lineStarts, matchBracket, offsetOf, positionOf, skippedRanges } from "./matching-bracket"

/** The highlight capture covering `part` of `text`, as tree-sitter reports one. */
function capture(text: string, part: string, group: string): SimpleHighlight {
  const start = text.indexOf(part)
  return [start, start + part.length, group]
}

const match = (text: string, at: number, highlights: SimpleHighlight[] | null = null) =>
  matchBracket(text, at, skippedRanges(highlights))

describe("bracketFrom", () => {
  test("takes the bracket under the cursor or the first one after it", () => {
    expect(bracketFrom("if (a) {", 0)).toBe(3)
    expect(bracketFrom("if (a) {", 3)).toBe(3)
    expect(bracketFrom("if (a) {", 4)).toBe(5)
  })

  test("is null with no bracket at or after the cursor", () => {
    expect(bracketFrom("f(a) + b", 4)).toBeNull()
    expect(bracketFrom("", 0)).toBeNull()
  })
})

describe("matchBracket", () => {
  test("pairs nested brackets of one kind", () => {
    const text = "{ a { b } c }"
    expect(match(text, 0)).toBe(12)
    expect(match(text, 4)).toBe(8)
  })

  test("a different kind does not count toward the depth", () => {
    const text = "( [ ) ] )"
    expect(match(text, 0)).toBe(4)
    expect(match(text, 2)).toBe(6)
  })

  test("a closer searches backward", () => {
    const text = "f(a, (b), c)"
    expect(match(text, 11)).toBe(1)
    expect(match(text, 7)).toBe(5)
  })

  test("passes over brackets inside strings and comments", () => {
    const text = 'f(")", // )\n  x)'
    const highlights = [capture(text, '")"', "string"), capture(text, "// )", "comment.line")]
    expect(match(text, 1, highlights)).toBe(text.length - 1)
    expect(match(text, text.length - 1, highlights)).toBe(1)
  })

  test("any string or comment group is skipped, and char literals", () => {
    const text = "f('(', `)`, /* ( */ a)"
    const highlights = [
      capture(text, "'('", "character"),
      capture(text, "`)`", "string.special"),
      capture(text, "/* ( */", "comment.block"),
    ]
    expect(match(text, 1, highlights)).toBe(text.length - 1)
  })

  test("a start inside a string matches within that string", () => {
    const text = 'f("(", x, ")")'
    const highlights = [capture(text, '"(", x, ")"', "string")]
    expect(match(text, 3, highlights)).toBe(11)
    expect(match(text, 11, highlights)).toBe(3)
    expect(match(text, 1, highlights)).toBe(13)
  })

  test("a start inside a string finds nothing outside it", () => {
    const text = 'f("(") )'
    const highlights = [capture(text, '"("', "string")]
    expect(match(text, 3, highlights)).toBeNull()
  })

  test("no match is null", () => {
    expect(match("{ a ( b }", 4)).toBeNull()
    expect(match("a } b", 2)).toBeNull()
    expect(match("abc", 1)).toBeNull()
  })
})

describe("skippedRanges", () => {
  test("merges nested captures and drops code ones", () => {
    const text = '"a\\nb" + c'
    const ranges = skippedRanges([capture(text, '"a\\nb"', "string"), capture(text, "\\n", "string.escape"), capture(text, "c", "variable")])
    expect(ranges).toEqual([{ start: 0, end: 6 }])
  })

  test("none without a parse", () => {
    expect(skippedRanges(null)).toEqual([])
  })
})

describe("line positions", () => {
  test("a 1-based line and column turn into an offset and back", () => {
    const starts = lineStarts("ab\ncde\n\nf")
    expect(offsetOf(starts, 2, 1)).toBe(4)
    expect(positionOf(starts, 4)).toEqual({ lineNum: 2, col: 1 })
    expect(positionOf(starts, 0)).toEqual({ lineNum: 1, col: 0 })
    expect(positionOf(starts, 8)).toEqual({ lineNum: 4, col: 0 })
    expect(offsetOf(starts, 9, 0)).toBeNull()
  })
})
