import { expect, test } from "bun:test"
import { parseDiff } from "../../utils/diff-parser"
import { anchorPlace, proposalAnchor, type ProposalPlace } from "./proposal-anchor"

// New numbers 1-5 then 41-42; old numbers 1-4 then 40-41.
const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,5 @@
 one
-two
+TWO
+three
 four
 five
@@ -40,2 +41,2 @@
 forty
-old
+new
diff --git a/dist/out.js b/dist/out.js
index 1111111..2222222 100644
--- a/dist/out.js
+++ b/dist/out.js
@@ -1 +1 @@
-a
+b
`

const files = parseDiff(DIFF)
const hidden = new Set(["dist/out.js"])
const anchor = (place: Partial<ProposalPlace>) =>
  proposalAnchor(files, hidden, { path: "src/a.ts", line: 1, side: "new", ...place })

test("an unknown path is refused by name", () => {
  expect(anchor({ path: "src/zz.ts" })).toBe("src/zz.ts is not a changed file; comments go on lines the diff shows.")
})

test("a file the ignore patterns hide is refused, as the file list leaves it out", () => {
  expect(anchor({ path: "dist/out.js" })).toContain("hidden by the reviewer's ignore patterns")
})

test("a context line and an added line take a comment on the new side, on the right", () => {
  expect(anchor({ line: 4 })).toEqual({ filename: "src/a.ts", line: 4, side: "RIGHT" })
  expect(anchor({ line: 3 })).toEqual({ filename: "src/a.ts", line: 3, side: "RIGHT" })
})

test("a removed line takes a comment on the old side, on the left", () => {
  expect(anchor({ line: 2, side: "old" })).toEqual({ filename: "src/a.ts", line: 2, side: "LEFT" })
  expect(anchorPlace({ filename: "src/a.ts", line: 2, side: "LEFT" })).toBe("src/a.ts:2 (old)")
})

test("a context line on the old side is refused, naming its new number", () => {
  expect(anchor({ line: 40, side: "old" })).toBe(
    "src/a.ts:40 on the old side is an unchanged line; it takes a comment as src/a.ts:41 on the new side.",
  )
})

test("an added line's number on the old side is not a line of the diff", () => {
  expect(anchor({ line: 5, side: "old" })).toBe(
    "src/a.ts:5 on the old side is not a line of the diff; comments go on lines the diff shows.",
  )
  expect(anchor({ line: 400 })).toBe(
    "src/a.ts:400 on the new side is not a line of the diff; comments go on lines the diff shows.",
  )
})

test("a range inside one hunk carries its first line", () => {
  expect(anchor({ startLine: 2, line: 4 })).toEqual({ filename: "src/a.ts", line: 4, startLine: 2, side: "RIGHT" })
  expect(anchorPlace({ filename: "src/a.ts", line: 4, startLine: 2, side: "RIGHT" })).toBe("src/a.ts:2-4")
})

test("a range crossing two hunks is refused", () => {
  expect(anchor({ startLine: 5, line: 42 })).toBe(
    "src/a.ts:5-42 on the new side is not one hunk's lines; a range stays inside one hunk.",
  )
})

test("a range whose start is not below its line is refused", () => {
  expect(anchor({ startLine: 4, line: 4 })).toBe("startLine 4 must be below line 4.")
  expect(anchor({ startLine: 5, line: 4 })).toBe("startLine 5 must be below line 4.")
})
