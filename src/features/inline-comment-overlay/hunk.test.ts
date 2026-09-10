import { test, expect, describe } from "bun:test"
import { commentHunk } from "./hunk"
import type { Comment } from "../../types"

function comment(overrides: Partial<Comment> & { id: string }): Comment {
  return {
    filename: "src/app.ts",
    line: 42,
    side: "RIGHT",
    body: "why?",
    createdAt: "2026-01-01T00:00:00Z",
    status: "synced",
    ...overrides,
  }
}

const hunk = "@@ -40,4 +40,4 @@\n context\n-  const old = 1\n+  const now = 2"

describe("the code a comment was written against", () => {
  test("comes from the comment's own stored hunk", () => {
    const comments = [comment({ id: "a", diffHunk: hunk, outdated: true })]

    expect(commentHunk(comments, "a")).toEqual({
      hunk,
      filename: "src/app.ts",
      line: 42,
      outdated: true,
      fromRoot: false,
    })
  })

  test("a reply borrows the thread's, which is what it is about anyway", () => {
    const comments = [
      comment({ id: "root", diffHunk: hunk, outdated: true }),
      comment({ id: "reply", inReplyTo: "root", body: "agreed" }),
    ]

    const found = commentHunk(comments, "reply")!
    expect(found.hunk).toBe(hunk)
    expect(found.fromRoot).toBe(true)
    expect(found.outdated).toBe(true)
  })

  test("a comment with no stored hunk has nothing to show", () => {
    expect(commentHunk([comment({ id: "a" })], "a")).toBeNull()
    expect(commentHunk([comment({ id: "a", diffHunk: "  \n " })], "a")).toBeNull()
  })

  test("a reply whose root has none has nothing either", () => {
    const comments = [comment({ id: "root" }), comment({ id: "reply", inReplyTo: "root" })]
    expect(commentHunk(comments, "reply")).toBeNull()
  })

  test("an unknown id is nothing, not a crash", () => {
    expect(commentHunk([comment({ id: "a", diffHunk: hunk })], "zzz")).toBeNull()
  })

  test("a comment that is not outdated still has its context", () => {
    const found = commentHunk([comment({ id: "a", diffHunk: hunk })], "a")!
    expect(found.outdated).toBe(false)
    expect(found.hunk).toBe(hunk)
  })
})
