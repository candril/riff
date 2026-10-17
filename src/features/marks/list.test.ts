import { test, expect, describe } from "bun:test"
import type { DiffFile } from "../../utils/diff-parser"
import { markEntries, markLineText, filterMarkEntries } from "./list"
import { setMark } from "./store"
import { createMarksState, type Mark } from "./types"

const file: DiffFile = {
  filename: "src/app.ts",
  additions: 2,
  deletions: 1,
  status: "modified",
  content: [
    "diff --git a/src/app.ts b/src/app.ts",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -10,3 +10,3 @@ function start() {",
    "   const a = 1",
    "-  const b = 2",
    "+  const b = 3",
    "   return a + b",
    "@@ -40,2 +40,3 @@",
    " export function stop() {",
    "+    halt()",
    " }",
    "\\ No newline at end of file",
  ].join("\n"),
}

const mark = (line: number | null, side: Mark["side"] = "RIGHT", letter = "a", filename = file.filename): Mark =>
  ({ letter, filename, line, side })

describe("a mark's line text", () => {
  test("reads an added line on the new side", () => {
    expect(markLineText(file, mark(11))).toBe("const b = 3")
  })

  test("reads a deleted line on the old side", () => {
    expect(markLineText(file, mark(11, "LEFT"))).toBe("const b = 2")
  })

  test("reads a context line from either side", () => {
    expect(markLineText(file, mark(12, "RIGHT"))).toBe("return a + b")
    expect(markLineText(file, mark(12, "LEFT"))).toBe("return a + b")
  })

  test("counts on into a later hunk", () => {
    expect(markLineText(file, mark(41))).toBe("halt()")
    expect(markLineText(file, mark(42))).toBe("}")
    expect(markLineText(file, mark(41, "LEFT"))).toBe("}")
  })

  test("is empty for a file mark", () => {
    expect(markLineText(file, mark(null))).toBe("")
  })

  test("is empty for a line outside every hunk", () => {
    expect(markLineText(file, mark(25))).toBe("")
  })

  test("is empty for a file no longer in the diff", () => {
    expect(markLineText(undefined, mark(11))).toBe("")
  })
})

describe("the mark list", () => {
  const marks = [mark(11, "RIGHT", "b"), mark(null, "RIGHT", "A", "docs/readme.md"), mark(41, "RIGHT", "a")]
    .reduce(setMark, createMarksState())
  const entries = markEntries(marks, [file])

  test("is in letter order, lowercase first", () => {
    expect(entries.map((e) => e.mark.letter)).toEqual(["a", "b", "A"])
    expect(entries.map((e) => e.text)).toEqual(["halt()", "const b = 3", ""])
  })

  test("keeps that order with no query", () => {
    expect(filterMarkEntries(entries, "")).toEqual(entries)
  })

  test("filters on the letter, the path and the text", () => {
    expect(filterMarkEntries(entries, "b").map((e) => e.mark.letter)).toEqual(["b"])
    expect(filterMarkEntries(entries, "readme").map((e) => e.mark.letter)).toEqual(["A"])
    expect(filterMarkEntries(entries, "halt").map((e) => e.mark.letter)).toEqual(["a"])
  })
})
