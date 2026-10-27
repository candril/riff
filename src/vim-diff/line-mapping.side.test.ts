import { describe, expect, test } from "bun:test"
import { DiffLineMapping } from "./line-mapping"
import type { DiffFile } from "../utils/diff-parser"

/**
 * One line removed near the top and one added further down, with untouched
 * runs around both hunks, so every line below the first hunk counts one
 * lower in the new file than in the old one until the second hunk.
 */
const file: DiffFile = {
  filename: "a.ts",
  additions: 1,
  deletions: 1,
  status: "modified",
  content: [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -3,3 +3,2 @@",
    " three",
    "-gone",
    " five",
    "@@ -10,2 +9,3 @@",
    " ten",
    "+new",
    " eleven",
  ].join("\n"),
}

const mapping = () => new DiffLineMapping([file], "all")
const contentAt = (m: DiffLineMapping, index: number | null) => (index === null ? null : m.getLine(index)!.content)

describe("lookups by line number on either side", () => {
  test("a line number counts in the new file unless the old side is asked for", () => {
    const m = mapping()
    expect(contentAt(m, m.findVisualLineForFileLine("a.ts", 4))).toBe("five")
    expect(contentAt(m, m.findVisualLineForFileLine("a.ts", 4, "old"))).toBe("gone")
    expect(contentAt(m, m.findVisualLineForFileLine("a.ts", 10, "new"))).toBe("new")
    expect(contentAt(m, m.findVisualLineForFileLine("a.ts", 10, "old"))).toBe("ten")
  })

  test("the divider holding a line is found by its old number too", () => {
    const m = mapping()
    // Old 6..9 and new 5..8 are the run between the hunks.
    expect(m.findDividerForLine("a.ts", 9, "old")).toBe("a.ts:middle:0")
    expect(m.findDividerForLine("a.ts", 9, "new")).toBeNull()
    expect(m.findDividerForLine("a.ts", 5, "new")).toBe("a.ts:middle:0")
    expect(m.findDividerForLine("a.ts", 6, "old")).toBe("a.ts:middle:0")
    expect(m.findDividerForLine("a.ts", 2, "old")).toBe("a.ts:start:0")
    expect(m.findDividerForLine("a.ts", 13, "old")).toBe("a.ts:end:0")
  })
})
