import { test, expect, describe } from "bun:test"
import { commentsInView } from "./notes"
import type { Comment } from "../types"
import type { DiffFile } from "./diff-parser"

const diffFile = (filename: string, hunks: string): DiffFile => ({
  filename,
  additions: 0,
  deletions: 0,
  status: "modified",
  content: `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n${hunks}`,
})

const comment = (over: Partial<Comment>): Comment => ({
  id: "c",
  filename: "src/a.ts",
  line: 1,
  side: "RIGHT",
  body: "…",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "local",
  ...over,
})

// One hunk covering new-file lines 10–14.
const files = [diffFile("src/a.ts", "@@ -10,5 +10,5 @@\n one\n")]

describe("commentsInView", () => {
  test("a note about a file this diff has never heard of is not shown", () => {
    const here = comment({ id: "here", kind: "note", line: 12 })
    const elsewhere = comment({ id: "elsewhere", kind: "note", filename: "src/z.ts", line: 1 })
    expect(commentsInView([here, elsewhere], files, false).map((c) => c.id)).toEqual(["here"])
  })

  test("a note on a line no hunk covers is not shown either", () => {
    const inside = comment({ id: "inside", kind: "note", line: 14 })
    const outside = comment({ id: "outside", kind: "note", line: 200 })
    expect(commentsInView([inside, outside], files, false).map((c) => c.id)).toEqual(["inside"])
  })

  test("a review comment is never filtered — one that drifted is information", () => {
    const drifted = comment({ id: "drifted", line: 200 })
    expect(commentsInView([drifted], files, false).map((c) => c.id)).toEqual(["drifted"])
  })

  test("file mode shows every note on a file it lists, read or not", () => {
    // A listed file has no hunks until it is opened (spec 084), so coverage
    // is not the question there — being listed is.
    const stub = [{ ...files[0]!, content: "diff --git a/src/a.ts b/src/a.ts\n" }]
    const note = comment({ id: "note", kind: "note", line: 900 })
    expect(commentsInView([note], stub, true).map((c) => c.id)).toEqual(["note"])
    expect(commentsInView([note], stub, false)).toEqual([])
  })

  test("a reply to a hidden note is hidden with it", () => {
    const root = comment({ id: "root", kind: "note", filename: "src/z.ts" })
    const reply = comment({ id: "reply", kind: "note", filename: "src/z.ts", inReplyTo: "root" })
    expect(commentsInView([root, reply], files, false)).toEqual([])
  })

  test("the LEFT side is read against the old file's lines", () => {
    const left = comment({ id: "left", kind: "note", side: "LEFT", line: 11 })
    const right = comment({ id: "right", kind: "note", side: "RIGHT", line: 11 })
    const renumbered = [diffFile("src/a.ts", "@@ -10,5 +100,5 @@\n one\n")]
    expect(commentsInView([left, right], renumbered, false).map((c) => c.id)).toEqual(["left"])
  })
})
