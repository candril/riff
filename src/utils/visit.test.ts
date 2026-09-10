import { test, expect, describe } from "bun:test"
import { isUnseen, markVisit, unseenComments, filesWithUnseen, wasRebased } from "./visit"
import type { Comment } from "../types"

function comment(id: string, createdAt: string, filename = "a.ts"): Comment {
  return {
    id,
    filename,
    line: 1,
    side: "RIGHT",
    body: id,
    createdAt,
    status: "synced",
  }
}

const watermark = {
  lastVisitAt: "2026-01-10T12:00:00Z",
  lastSeenHeadSha: "abc1234def",
  seenCommentIds: [] as string[],
}

describe("what arrived since you last looked", () => {
  const older = comment("old", "2026-01-09T09:00:00Z")
  const newer = comment("new", "2026-01-11T09:00:00Z", "b.ts")

  test("a comment older than the mark is seen by definition", () => {
    expect(isUnseen(older, watermark)).toBe(false)
    expect(isUnseen(newer, watermark)).toBe(true)
  })

  test("a comment the last visit had already read stays read", () => {
    expect(isUnseen(newer, { ...watermark, seenCommentIds: ["new"] })).toBe(false)
  })

  test("a first visit marks nothing new — there is nothing to compare against", () => {
    expect(isUnseen(newer, null)).toBe(false)
    expect(unseenComments([older, newer], null)).toEqual([])
  })

  test("the files carrying something unread", () => {
    expect(filesWithUnseen([older, newer], watermark)).toEqual(new Set(["b.ts"]))
  })
})

describe("leaving a mark", () => {
  test("now, at this head", () => {
    const left = markVisit([], "head9", new Set(), "2026-01-12T08:00:00Z")

    expect(left).toEqual({
      lastVisitAt: "2026-01-12T08:00:00Z",
      lastSeenHeadSha: "head9",
      seenCommentIds: [],
    })
  })

  test("only ids the next visit could still mistake for new are kept", () => {
    const comments = [comment("old", "2026-01-09T09:00:00Z"), comment("new", "2026-01-13T09:00:00Z")]
    const left = markVisit(comments, "head9", new Set(["old", "new"]), "2026-01-12T08:00:00Z")

    // Everything older than the mark is seen by being older; only the one
    // that is newer than it has to be remembered by id.
    expect(left.seenCommentIds).toEqual(["new"])
  })
})

describe("a branch rewritten under the reader", () => {
  const commits = [{ sha: "abc1234" }, { sha: "def5678" }]

  test("the head riff remembers is gone from the PR", () => {
    expect(wasRebased({ ...watermark, lastSeenHeadSha: "999aaa000" }, commits, 100)).toBe(true)
    // `abc1234def` is the full form of the short sha the commit list carries.
    expect(wasRebased(watermark, commits, 100)).toBe(false)
  })

  test("nothing to say without a previous visit, or on a truncated list", () => {
    expect(wasRebased(null, commits, 100)).toBe(false)
    expect(wasRebased(watermark, commits, 2)).toBe(false)
  })
})
