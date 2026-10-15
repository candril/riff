import { test, expect } from "bun:test"
import { diffHunkAt } from "./diff-hunk"
import { anchorLineFromHunk } from "../cli/comments"
import { fileAsDiff } from "../providers/files"

/*
 * Old file lines 3..10, new file lines 3..9: old 4-8 are replaced by new
 * 4-7, old 9 `}` survives as new 8. A second hunk starts at old 40 / new 39.
 */
const DIFF = [
  "diff --git a/f.ts b/f.ts",
  "index 1111111..2222222 100644",
  "--- a/f.ts",
  "+++ b/f.ts",
  "@@ -3,8 +3,7 @@ function f() {",
  " ctx3",
  "-old4",
  "-old5",
  "-old6",
  "-old7",
  "-old8",
  "+new4",
  "+new5",
  "+new6",
  "+new7",
  " }",
  " ctx10",
  "@@ -40,3 +39,4 @@",
  " ctx40",
  "+new40",
  " ctx41",
  " ctx42",
  "",
].join("\n")

test("LEFT on a removal followed by additions ends at the removal", () => {
  const hunk = diffHunkAt(DIFF, 6, "LEFT")!
  expect(hunk).toBe(["@@ -3,8 +3,7 @@ function f() {", " ctx3", "-old4", "-old5", "-old6"].join("\n"))
  expect(anchorLineFromHunk(hunk, "LEFT")).toBe("old6")
})

test("LEFT on a context line after removals and additions ends at that line, not at the removals", () => {
  const hunk = diffHunkAt(DIFF, 9, "LEFT")!
  expect(hunk.split("\n").at(-1)).toBe(" }")
  expect(anchorLineFromHunk(hunk, "LEFT")).toBe("}")
})

test("RIGHT on an addition after removals ends at the addition", () => {
  const hunk = diffHunkAt(DIFF, 5, "RIGHT")!
  expect(hunk).toBe(["-old6", "-old7", "-old8", "+new4", "+new5"].join("\n"))
  expect(anchorLineFromHunk(hunk, "RIGHT")).toBe("new5")
})

test("a line in the second hunk is numbered from that hunk's header", () => {
  const right = diffHunkAt(DIFF, 41, "RIGHT")!
  expect(right).toBe([" ctx10", "@@ -40,3 +39,4 @@", " ctx40", "+new40", " ctx41"].join("\n"))
  expect(anchorLineFromHunk(right, "RIGHT")).toBe("ctx41")
  expect(anchorLineFromHunk(diffHunkAt(DIFF, 41, "LEFT")!, "LEFT")).toBe("ctx41")
})

test("a line outside every hunk has no stored context", () => {
  expect(diffHunkAt(DIFF, 20, "RIGHT")).toBeNull()
  expect(diffHunkAt(DIFF, 1, "LEFT")).toBeNull()
  expect(diffHunkAt("", 1, "RIGHT")).toBeNull()
})

test("a note in file mode is stored with the file's lines above it", () => {
  const hunk = diffHunkAt(fileAsDiff("a.ts", "one\ntwo\nthree\nfour\n"), 3, "RIGHT")
  expect(hunk).toBe(["@@ -1,4 +1,4 @@", " one", " two", " three"].join("\n"))
  expect(anchorLineFromHunk(hunk!, "RIGHT")).toBe("three")
})
