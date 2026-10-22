import { test, expect, describe } from "bun:test"
import { createInitialState, withPendingComments, type AppState } from "./state"
import type { Comment } from "./types"
import type { PendingReview } from "./providers/github/types"

const comment = (id: string, extra: Partial<Comment> = {}): Comment => ({
  id,
  filename: "a.ts",
  line: 1,
  side: "RIGHT",
  body: id,
  createdAt: "2026-01-10T10:00:00Z",
  status: "local",
  ...extra,
})

function withComments(comments: Comment[]): AppState {
  return { ...createInitialState([], [], "gh:o/r#1", ""), comments }
}

const review = (comments: PendingReview["comments"]): PendingReview => ({ id: 7, user: "octo", body: "", comments })

describe("withPendingComments", () => {
  test("adds the review's comments as pending ones by its author", () => {
    const next = withPendingComments(withComments([comment("c1")]), review([
      { id: 11, body: "Draft", path: "b.ts", line: 4, side: "LEFT" },
    ]))

    expect(next.comments.map(c => c.id)).toEqual(["c1", "pending-11"])
    expect(next.comments[1]).toMatchObject({
      filename: "b.ts",
      line: 4,
      side: "LEFT",
      body: "Draft",
      status: "pending",
      githubId: 11,
      author: "octo",
      inReplyTo: undefined,
    })
  })

  test("a reply's parent is the synced comment when there is one, and the pending one otherwise", () => {
    const synced = comment("gh-5", { status: "synced", githubId: 5 })
    const next = withPendingComments(withComments([synced]), review([
      { id: 11, body: "To synced", path: "a.ts", line: 1, side: "RIGHT", inReplyToId: 5 },
      { id: 12, body: "To pending", path: "a.ts", line: 1, side: "RIGHT", inReplyToId: 11 },
    ]))

    expect(next.comments.map(c => c.inReplyTo)).toEqual([undefined, "gh-5", "pending-11"])
  })

  test("replaces the pending comments an earlier review brought", () => {
    const earlier = withPendingComments(withComments([comment("c1")]), review([
      { id: 11, body: "Old", path: "a.ts", line: 1, side: "RIGHT" },
    ]))
    const next = withPendingComments(earlier, review([
      { id: 12, body: "New", path: "a.ts", line: 2, side: "RIGHT" },
    ]))

    expect(next.comments.map(c => c.id)).toEqual(["c1", "pending-12"])
  })

  test("null removes the pending comments and keeps the rest", () => {
    const earlier = withPendingComments(withComments([comment("c1")]), review([
      { id: 11, body: "Old", path: "a.ts", line: 1, side: "RIGHT" },
    ]))

    expect(withPendingComments(earlier, null).comments.map(c => c.id)).toEqual(["c1"])
  })
})
