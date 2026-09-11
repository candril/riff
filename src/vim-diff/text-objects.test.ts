import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "./line-mapping"
import { resolveTextObject } from "./text-objects"
import type { DiffFile } from "../utils/diff-parser"

function diffFile(filename: string, body: string): DiffFile {
  return {
    filename,
    additions: 0,
    deletions: 0,
    status: "modified",
    content: [
      `diff --git a/${filename} b/${filename}`,
      `--- a/${filename}`,
      `+++ b/${filename}`,
      body.replace(/\n$/, ""),
    ].join("\n"),
  }
}

/**
 *  0 context   function run(opts) {
 *  1 deletion    const old = "gone"
 *  2 addition    const name = "kept"
 *  3 addition    const extra = 1
 *  4 context     if (opts.flag) {
 *  5 context       return name
 *  6 context     }
 *  7 context   }
 */
const sample = new DiffLineMapping(
  [
    diffFile(
      "app.ts",
      `@@ -1,6 +1,7 @@
 function run(opts) {
-  const old = "gone"
+  const name = "kept"
+  const extra = 1
   if (opts.flag) {
     return name
   }
 }`
    ),
  ],
  "single",
  0
)

describe("word objects", () => {
  test("iw takes the run under the cursor, aw its trailing space", () => {
    // "  const name = ..." — cursor inside `name`.
    expect(resolveTextObject(sample, 2, 9, "i", "w")).toEqual({
      kind: "charwise",
      startLine: 2,
      startCol: 8,
      endLine: 2,
      endCol: 11,
    })
    expect(resolveTextObject(sample, 2, 9, "a", "w")).toEqual({
      kind: "charwise",
      startLine: 2,
      startCol: 8,
      endLine: 2,
      endCol: 12,
    })
  })

  test("iw on punctuation stops at the word boundary, iW does not", () => {
    // "  if (opts.flag) {" — cursor on the `.`
    expect(resolveTextObject(sample, 4, 10, "i", "w")).toEqual({
      kind: "charwise",
      startLine: 4,
      startCol: 10,
      endLine: 4,
      endCol: 10,
    })
    expect(resolveTextObject(sample, 4, 10, "i", "W")).toEqual({
      kind: "charwise",
      startLine: 4,
      startCol: 5,
      endLine: 4,
      endCol: 15,
    })
  })
})

describe("quote objects", () => {
  test('i" is the text between the quotes, a" includes them', () => {
    expect(resolveTextObject(sample, 2, 9, "i", '"')).toEqual({
      kind: "charwise",
      startLine: 2,
      startCol: 16,
      endLine: 2,
      endCol: 19,
    })
    expect(resolveTextObject(sample, 2, 9, "a", '"')).toEqual({
      kind: "charwise",
      startLine: 2,
      startCol: 15,
      endLine: 2,
      endCol: 20,
    })
  })

  test("no pair on the line resolves to nothing", () => {
    expect(resolveTextObject(sample, 4, 2, "i", '"')).toBeNull()
  })
})

describe("bracket objects", () => {
  test("i( inside a call is charwise", () => {
    // "  if (opts.flag) {" — cursor on `opts`.
    expect(resolveTextObject(sample, 4, 7, "i", "(")).toEqual({
      kind: "charwise",
      startLine: 4,
      startCol: 6,
      endLine: 4,
      endCol: 14,
    })
    expect(resolveTextObject(sample, 4, 7, "a", "b")).toEqual({
      kind: "charwise",
      startLine: 4,
      startCol: 5,
      endLine: 4,
      endCol: 15,
    })
  })

  test("i{ over a block spanning lines is linewise", () => {
    // Cursor on `return name`, inside the `if` block.
    expect(resolveTextObject(sample, 5, 6, "i", "{")).toEqual({
      kind: "linewise",
      startLine: 5,
      endLine: 5,
    })
  })

  test("a{ keeps the braces, so it spans the rows they sit on", () => {
    expect(resolveTextObject(sample, 5, 6, "a", "B")).toEqual({
      kind: "charwise",
      startLine: 4,
      startCol: 17,
      endLine: 6,
      endCol: 2,
    })
  })

  test("the search walks one side of the diff only", () => {
    /**
     * A refactor that moves the brace onto the `if` line, so the two
     * versions disagree about where the block opens.
     *
     *  0 context   function run() {
     *  1 deletion    if (x)
     *  2 deletion    {
     *  3 addition    if (y) {
     *  4 context       work()
     *  5 context     }
     *  6 context   }
     */
    const mixed = new DiffLineMapping(
      [
        diffFile(
          "mixed.ts",
          `@@ -1,6 +1,5 @@
 function run() {
-  if (x)
-  {
+  if (y) {
     work()
   }
 }`
        ),
      ],
      "single",
      0
    )

    // From a context row the new side answers: the brace on the added `if`
    // opens the block, not the deleted one two rows above it.
    expect(resolveTextObject(mixed, 4, 5, "a", "{")).toEqual({
      kind: "charwise",
      startLine: 3,
      startCol: 9,
      endLine: 5,
      endCol: 2,
    })

    // From a deleted row it is the old side, where the brace stands alone.
    expect(resolveTextObject(mixed, 2, 2, "a", "{")).toEqual({
      kind: "charwise",
      startLine: 2,
      startCol: 2,
      endLine: 5,
      endCol: 2,
    })
  })

  test("a partner behind a structural row is out of reach", () => {
    const twoFiles = new DiffLineMapping(
      [diffFile("a.ts", "@@ -1,1 +1,1 @@\n if (a) {"), diffFile("b.ts", "@@ -1,1 +1,1 @@\n }")],
      "all"
    )
    expect(resolveTextObject(twoFiles, 1, 8, "i", "{")).toBeNull()
  })
})

describe("diff objects", () => {
  test("i+ is the run of added rows under the cursor", () => {
    expect(resolveTextObject(sample, 3, 0, "i", "+")).toEqual({
      kind: "linewise",
      startLine: 2,
      endLine: 3,
    })
    expect(resolveTextObject(sample, 1, 0, "i", "-")).toEqual({
      kind: "linewise",
      startLine: 1,
      endLine: 1,
    })
    expect(resolveTextObject(sample, 0, 0, "i", "+")).toBeNull()
  })

  test("ih is the block of rows between the gaps", () => {
    expect(resolveTextObject(sample, 3, 0, "i", "h")).toEqual({
      kind: "linewise",
      startLine: 0,
      endLine: 7,
    })
  })

  test("if is the file's rows, af its header and trailing gap", () => {
    const allFiles = new DiffLineMapping(
      [
        diffFile("a.ts", "@@ -1,2 +1,2 @@\n keep\n-drop\n+add"),
        diffFile("b.ts", "@@ -1,1 +1,1 @@\n other"),
      ],
      "all"
    )

    // 0 file-header, 1 context, 2 deletion, 3 addition, 4 the run after the
    // last hunk (spec 074), 5 spacing, 6 header…
    expect(resolveTextObject(allFiles, 2, 0, "i", "f")).toEqual({
      kind: "linewise",
      startLine: 1,
      endLine: 3,
    })
    expect(resolveTextObject(allFiles, 2, 0, "a", "f")).toEqual({
      kind: "linewise",
      startLine: 0,
      endLine: 5,
    })
  })
})
