import { describe, expect, test } from "bun:test"
import type { DiffFile } from "../../utils/diff-parser"
import { buildOccurrenceRows } from "./corpus"

function file(filename: string, content: string): DiffFile {
  return { filename, additions: 0, deletions: 0, status: "modified", content }
}

describe("buildOccurrenceRows", () => {
  test("numbers rows per side across hunks and drops the headers", () => {
    const rows = buildOccurrenceRows([
      file(
        "a.ts",
        [
          "diff --git a/a.ts b/a.ts",
          "--- a/a.ts",
          "+++ b/a.ts",
          "@@ -1,3 +1,3 @@",
          " one",
          "-two",
          "+TWO",
          " three",
          "@@ -10,2 +10,3 @@ function tail() {",
          " ten",
          "+inserted",
          " eleven",
          "\\ No newline at end of file",
        ].join("\n")
      ),
    ])

    expect(rows.map((r) => [r.kind, r.side, r.lineNum, r.text])).toEqual([
      ["context", "RIGHT", 1, "one"],
      ["deletion", "LEFT", 2, "two"],
      ["addition", "RIGHT", 2, "TWO"],
      ["context", "RIGHT", 3, "three"],
      ["context", "RIGHT", 10, "ten"],
      ["addition", "RIGHT", 11, "inserted"],
      ["context", "RIGHT", 12, "eleven"],
    ])
  })

  test("a deleted line that reads like a header is still a row", () => {
    const rows = buildOccurrenceRows([file("a.sql", "@@ -1,1 +0,0 @@\n--- a comment")])
    expect(rows).toEqual([
      { fileIndex: 0, filename: "a.sql", kind: "deletion", lineNum: 1, side: "LEFT", text: "-- a comment" },
    ])
  })

  test("keeps each row's file and its index", () => {
    const rows = buildOccurrenceRows([
      file("a.ts", "@@ -1 +1 @@\n+a"),
      file("binary.png", "Binary files differ"),
      file("b.ts", "@@ -1 +1 @@\n+b"),
    ])
    expect(rows.map((r) => [r.filename, r.fileIndex])).toEqual([
      ["a.ts", 0],
      ["b.ts", 2],
    ])
  })
})
