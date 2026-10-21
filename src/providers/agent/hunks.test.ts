import { expect, test } from "bun:test"
import { TWO_FILES } from "../../testing/diffs"
import { parseDiff } from "../../utils/diff-parser"
import { countsOf, describeFile, formatDiffLine, hunksOf } from "./hunks"

const [modified, added] = parseDiff(TWO_FILES)

test("a modified file's hunk carries old and new numbers on each line", () => {
  const hunks = hunksOf(modified!)
  expect(hunks.map((h) => h.header)).toEqual(["@@ -1,5 +1,5 @@"])
  expect(hunks[0]!.lines.map(formatDiffLine)).toEqual([
    "    1     1  export function greet(name: string) {",
    '    2       -  return "Hello " + name',
    "          2 +  return `Hello ${name}`",
    "    3     3  }",
    "          4 +",
    "    4     5  export const version = 1",
  ])
})

test("an added file's lines are new lines only", () => {
  const lines = hunksOf(added!)[0]!.lines
  expect(lines.every((l) => l.kind === "added" && l.oldLine === undefined)).toBe(true)
  expect(lines.map((l) => l.newLine)).toEqual([1, 2, 3])
  expect(describeFile(added!)).toBe("added src/farewell.ts (+3 -0)")
})

test("a diff with no hunks, a binary or a bare rename, has no line changes", () => {
  const [renamed] = parseDiff(
    "diff --git a/old.png b/new.png\nsimilarity index 100%\nrename from old.png\nrename to new.png\n",
  )
  expect(hunksOf(renamed!)).toEqual([])
  expect(countsOf(renamed!)).toBe("no line changes")
  expect(describeFile(renamed!)).toBe("renamed old.png -> new.png (no line changes)")
})

test('"\\ No newline" is not a line and does not move the numbers', () => {
  const [file] = parseDiff(
    "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n",
  )
  expect(hunksOf(file!)[0]!.lines).toEqual([
    { kind: "removed", text: "old", oldLine: 1 },
    { kind: "added", text: "new", newLine: 1 },
  ])
})
