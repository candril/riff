import { describe, expect, test } from "bun:test"
import type { Comment } from "../types"
import { reparentReplies } from "./reply-parents"

function comment(overrides: Partial<Comment> & { id: string }): Comment {
  return {
    filename: "a.ts",
    line: 1,
    side: "RIGHT",
    body: "body",
    createdAt: "2026-01-01T00:00:00Z",
    status: "local",
    ...overrides,
  }
}

describe("reparentReplies", () => {
  test("points a reply whose parent gave way at the fetched copy with the parent's githubId", () => {
    const parent = comment({ id: "pending-11", githubId: 11, status: "synced" })
    const reply = comment({ id: "r", inReplyTo: "pending-11" })
    const [moved] = reparentReplies([reply], [parent], [comment({ id: "gh-11", githubId: 11 })])
    expect(moved!.inReplyTo).toBe("gh-11")
  })

  test("a reply loaded from disk finds a draft parent's copy by the githubId in its pending- id", () => {
    const reply = comment({ id: "r", inReplyTo: "pending-11" })
    const [moved] = reparentReplies([reply], [], [comment({ id: "gh-11", githubId: 11 })])
    expect(moved!.inReplyTo).toBe("gh-11")
  })

  test("leaves a reply whose parent stayed as the same object", () => {
    const reply = comment({ id: "r", inReplyTo: "draft" })
    const [kept] = reparentReplies([reply], [comment({ id: "pending-11", githubId: 11 })], [comment({ id: "gh-11", githubId: 11 })])
    expect(kept).toBe(reply)
  })
})
