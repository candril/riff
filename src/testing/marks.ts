import type { DiffFile } from "../utils/diff-parser"

/**
 * One file whose old and new numbering drift apart by one after its first
 * hunk, so a LEFT and a RIGHT number on the same context row differ, and a
 * second file so the first is followed by spacing. Rows in all-files mode:
 *
 *   0 header x.ts      5 ctx  old 3 new 4     10 ctx  old 10 new 11
 *   1 ctx  old 1 new 1 6 divider (new 5–8)    11 divider (rest of file)
 *   2 del  old 2       7 ctx  old 8 new 9     12 spacing
 *   3 add  new 2       8 del  old 9           13 header y.ts
 *   4 add  new 3       9 add  new 10
 */
export const X: DiffFile = {
  filename: "src/x.ts",
  additions: 3,
  deletions: 2,
  status: "modified",
  content: [
    "diff --git a/src/x.ts b/src/x.ts",
    "--- a/src/x.ts",
    "+++ b/src/x.ts",
    "@@ -1,3 +1,4 @@",
    " n1",
    "-o2",
    "+n2",
    "+n3",
    " n4",
    "@@ -8,3 +9,3 @@",
    " n9",
    "-o9",
    "+n10",
    " n11",
  ].join("\n"),
}

export const Y: DiffFile = {
  filename: "src/y.ts",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: ["diff --git a/src/y.ts b/src/y.ts", "--- a/src/y.ts", "+++ b/src/y.ts", "@@ -1,1 +1,2 @@", " y1", "+y2"].join(
    "\n"
  ),
}

export const X_CONTENT = Array.from({ length: 12 }, (_, i) => `n${i + 1}`).join("\n")
export const X_MIDDLE = "src/x.ts:middle:0"

/** A markdown file whose mermaid block, new lines 2 to 5, can fold to one row. */
export const DOC: DiffFile = {
  filename: "doc.md",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: [
    "diff --git a/doc.md b/doc.md",
    "--- a/doc.md",
    "+++ b/doc.md",
    "@@ -1,6 +1,7 @@",
    " # Title",
    " ```mermaid",
    " sequenceDiagram",
    "+  A->>B: hi",
    " ```",
    " prose after",
  ].join("\n"),
}

/**
 * X after a commit put two lines above it: every new number is two higher
 * and the old ones are untouched, so `n10` moves from new line 10 to 12.
 */
export const X_SHIFTED: DiffFile = {
  ...X,
  additions: 5,
  content: [
    "diff --git a/src/x.ts b/src/x.ts",
    "--- a/src/x.ts",
    "+++ b/src/x.ts",
    "@@ -1,3 +1,6 @@",
    "+p1",
    "+p2",
    " n1",
    "-o2",
    "+n2",
    "+n3",
    " n4",
    "@@ -8,3 +11,3 @@",
    " n9",
    "-o9",
    "+n10",
    " n11",
  ].join("\n"),
}
