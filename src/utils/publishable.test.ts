import { describe, expect, test } from "bun:test"
import type { Comment } from "../types"
import { isLocallyResolved, publishableLocalComments, isNote } from "./publishable"

function comment(overrides: Partial<Comment>): Comment {
  return {
    id: "c",
    filename: "src/a.ts",
    line: 1,
    side: "RIGHT",
    body: "…",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "local",
    ...overrides,
  }
}

describe("publishable local comments", () => {
  const open = comment({ id: "open" })
  const resolved = comment({ id: "resolved", isThreadResolved: true })
  const replyToResolved = comment({ id: "r1", inReplyTo: "resolved" })
  const replyToOpen = comment({ id: "r2", inReplyTo: "open" })
  const synced = comment({ id: "synced", status: "synced", githubId: 1, isThreadResolved: true })
  const all = [open, resolved, replyToResolved, replyToOpen, synced]

  test("a locally resolved root is not publishable", () => {
    expect(isLocallyResolved(resolved, all)).toBe(true)
    expect(isLocallyResolved(open, all)).toBe(false)
  })

  test("replies follow their root", () => {
    expect(isLocallyResolved(replyToResolved, all)).toBe(true)
    expect(isLocallyResolved(replyToOpen, all)).toBe(false)
  })

  test("resolution on a synced thread is GitHub's business, not a local veto", () => {
    expect(isLocallyResolved(synced, all)).toBe(false)
  })

  test("publishableLocalComments keeps only open local comments", () => {
    expect(publishableLocalComments(all).map((c) => c.id)).toEqual(["open", "r2"])
  })

  test("a reply whose root is gone stands on its own", () => {
    const orphan = comment({ id: "orphan", inReplyTo: "missing" })
    expect(isLocallyResolved(orphan, [orphan])).toBe(false)
  })
})

describe("notes never leave the machine", () => {
  test("a note is not publishable, open or not", () => {
    const note = comment({ id: "note", kind: "note" })
    const review = comment({ id: "review" })
    expect(isNote(note)).toBe(true)
    expect(isNote(review)).toBe(false)
    expect(publishableLocalComments([note, review]).map((c) => c.id)).toEqual(["review"])
  })

  test("a reply to a note is refused with it", () => {
    // GitHub cannot anchor the thread, so it cannot take the reply either.
    const note = comment({ id: "note", kind: "note" })
    const reply = comment({ id: "reply", kind: "note", inReplyTo: "note" })
    expect(publishableLocalComments([note, reply])).toEqual([])
  })
})
