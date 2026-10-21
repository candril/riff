import { describe, expect, test } from "bun:test"
import type { Position } from "../../providers/agent/position"
import { parseDiff } from "../../utils/diff-parser"
import { ATTACHMENT_LINES, expandReferences, type PrSummary, type ReferenceContext } from "./references"

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
diff --git a/src/b.ts b/src/b.ts
new file mode 100644
--- /dev/null
+++ b/src/b.ts
@@ -0,0 +1,1 @@
+b
`

const files = parseDiff(DIFF)

const at = (fields: Partial<Position> = {}): Position => ({
  path: "src/a.ts",
  side: "new",
  line: 2,
  excerpt: [],
  label: "src/a.ts:2",
  ...fields,
})

const PR: PrSummary = {
  number: 812,
  title: "Greet louder",
  description: "Why: it was too quiet.",
  files: [{ path: "src/a.ts", status: "modified", additions: 3, deletions: 2 }],
}

const expand = (text: string, ctx: Partial<ReferenceContext> = {}) =>
  expandReferences(text, { files, position: at(), pr: null, ...ctx })

describe("@selection", () => {
  test("attaches every selected line on its side with the hunk header, wherever the cursor's excerpt ends", () => {
    const result = expand("why @selection", { position: at({ selection: { start: 2, end: 3 }, excerpt: [] }) })
    expect(result).toEqual({
      attachments: [
        [
          "[@selection: src/a.ts:2-3 (new side)]",
          "@@ -1,4 +1,5 @@",
          "          2 +TWO",
          "          3 +three",
        ].join("\n"),
      ],
      labels: ["@selection a.ts:2-3"],
    })
  })

  test("@s is the same token, and the other side's lines between the ends come along", () => {
    const result = expand("@s", { position: at({ selection: { start: 1, end: 2 } }) })
    expect(result).toMatchObject({
      attachments: [
        [
          "[@selection: src/a.ts:1-2 (new side)]",
          "@@ -1,4 +1,5 @@",
          "    1     1  one",
          "    2       -two",
          "          2 +TWO",
        ].join("\n"),
      ],
      labels: ["@selection a.ts:1-2"],
    })
  })

  test("an old-side selection reads old numbers, across hunks", () => {
    const result = expand("@selection", { position: at({ side: "old", selection: { start: 4, end: 41 } }) })
    if (!("attachments" in result)) throw new Error(result.error)
    expect(result.attachments[0]!.split("\n")).toEqual([
      "[@selection: src/a.ts:4-41 (old side)]",
      "@@ -1,4 +1,5 @@",
      "    4     5  five",
      "@@ -40,2 +41,2 @@",
      "   40    41  forty",
      "   41       -old",
    ])
  })

  test("without a selection, or without a position, the question is not sent", () => {
    const error = "@selection needs a visual selection in the diff; the question was not sent."
    expect(expand("@selection")).toEqual({ error })
    expect(expand("@s", { position: null })).toEqual({ error })
  })
})

describe("@file and @path", () => {
  test("@file attaches the diff of the file under the cursor in read_diff's format", () => {
    const result = expand("@file what changed?")
    if (!("attachments" in result)) throw new Error(result.error)
    expect(result.labels).toEqual(["@file src/a.ts"])
    expect(result.attachments[0]!.split("\n")).toEqual([
      "[@file: the diff of src/a.ts]",
      "@@ -1,4 +1,5 @@",
      "    1     1  one",
      "    2       -two",
      "          2 +TWO",
      "          3 +three",
      "    3     4  four",
      "    4     5  five",
      "@@ -40,2 +41,2 @@",
      "   40    41  forty",
      "   41       -old",
      "         42 +new",
    ])
  })

  test("@file without a position is an error", () => {
    expect(expand("@file", { position: null })).toEqual({
      error: "@file needs the diff cursor on a file; the question was not sent.",
    })
  })

  test("@path attaches another changed file, its trailing punctuation dropped", () => {
    expect(expand("compare @src/b.ts, please")).toEqual({
      attachments: ["[@src/b.ts: its diff]\n@@ -0,0 +1,1 @@\n          1 +b"],
      labels: ["@src/b.ts"],
    })
  })

  test("a path that is no changed file stops the question", () => {
    expect(expand("@nope/missing.ts why")).toEqual({
      error: "@nope/missing.ts is not a file of this change; the question was not sent.",
    })
    expect(expand("see @readme.md")).toMatchObject({ error: expect.stringContaining("@readme.md") })
  })

  test("@Inject, @handle and a mail address stay text", () => {
    expect(expand("does @Inject work for @octocat? mail a@b.ts")).toEqual({ attachments: [], labels: [] })
  })

  test("a repeated token, or @file and the same @path, attaches once", () => {
    const result = expand("@file @file @src/a.ts @src/b.ts @src/b.ts")
    expect(result).toMatchObject({ labels: ["@file src/a.ts", "@src/b.ts"] })
  })
})

describe("@pr", () => {
  test("attaches the title, number, description and file list with counts", () => {
    expect(expand("@pr summary?", { pr: PR })).toEqual({
      attachments: [
        [
          "[@pr: pull request #812, its description and changed files]",
          "#812 Greet louder",
          "Why: it was too quiet.",
          "",
          "Changed files (1):",
          "modified src/a.ts (+3 -2)",
        ].join("\n"),
      ],
      labels: ["@pr #812"],
    })
  })

  test("a local review has no pull request", () => {
    expect(expand("@pr", { pr: null })).toEqual({ error: "@pr needs a pull request review." })
  })
})

describe("the cap", () => {
  const long = (n: number) =>
    parseDiff(
      `diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n@@ -0,0 +1,${n} @@\n${Array.from({ length: n }, (_, i) => `+l${i + 1}`).join("\n")}\n`,
    )

  test("a file diff past the cap is cut with a footer that says where read_diff continues", () => {
    const result = expandReferences("@big.ts", { files: long(500), position: null, pr: null })
    if (!("attachments" in result)) throw new Error(result.error)
    const lines = result.attachments[0]!.split("\n")
    expect(lines).toHaveLength(ATTACHMENT_LINES + 2)
    expect(lines.at(-2)).toBe("        399 +l399")
    expect(lines.at(-1)).toBe("[cut at 400 of 501 lines; read_diff path=big.ts offset=400 for the rest]")
  })

  test("a selection past the cap points read_diff at its first line left out", () => {
    const result = expandReferences("@selection", {
      files: long(500),
      position: at({ path: "big.ts", selection: { start: 51, end: 500 } }),
      pr: null,
    })
    if (!("attachments" in result)) throw new Error(result.error)
    expect(result.attachments[0]!.split("\n").at(-1)).toBe(
      "[cut at 400 of 451 lines; read_diff path=big.ts offset=450 for the rest]",
    )
  })

  test("a long file list is cut with a footer that points at list_files", () => {
    const pr = {
      ...PR,
      files: Array.from({ length: 450 }, (_, i) => ({ path: `f${i}.ts`, status: "added" as const, additions: 1, deletions: 0 })),
    }
    const result = expand("@pr", { pr })
    if (!("attachments" in result)) throw new Error(result.error)
    expect(result.attachments[0]!.split("\n").at(-1)).toBe(
      "[cut at 400 of 454 lines; list_files offset=396 for the rest]",
    )
  })
})
