import { describe, expect, test } from "bun:test"
import { excerpt, highlight, narrowMarks, type Segment } from "./occurrence-excerpt"

const plain = (segments: Segment[]) => segments.map((s) => [s.text, s.mark])

describe("excerpt", () => {
  test("drops indentation before the match", () => {
    expect(plain(excerpt("    foo(bar)", [8, 11]))).toEqual([
      ["foo(", "plain"],
      ["bar", "match"],
      [")", "plain"],
    ])
  })

  test("brings a far-right match into view", () => {
    const segments = excerpt(`${"x".repeat(100)}needle`, [100, 106])
    expect(segments[0]).toEqual({ text: "…", mark: "plain" })
    expect(segments[1]!.text.length).toBe(47)
    expect(segments[2]).toEqual({ text: "needle", mark: "match" })
  })

  test("marks narrowing terms, and the match wins where they overlap", () => {
    expect(plain(excerpt("foo(bar, baz)", [4, 7], [[5, 9], [9, 12]]))).toEqual([
      ["foo(", "plain"],
      ["bar", "match"],
      [", baz", "narrow"],
      [")", "plain"],
    ])
  })

  test("cuts a path into runs at its narrowing terms", () => {
    expect(plain(highlight("src/main.ts", narrowMarks([[4, 8]])))).toEqual([
      ["src/", "plain"],
      ["main", "narrow"],
      [".ts", "plain"],
    ])
  })
})
