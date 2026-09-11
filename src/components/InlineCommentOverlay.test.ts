import { describe, expect, test } from "bun:test"
import { visibleOverlayCommentIds } from "./InlineCommentOverlay"
import type { Comment } from "../types"

function comment(id: string, line: number, inReplyTo?: string): Comment {
  return {
    id,
    filename: "parser.ts",
    line,
    side: "RIGHT",
    body: id,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    inReplyTo,
  }
}

describe("the rows flash can label", () => {
  const thread = [comment("a1", 10), comment("a2", 10, "a1")]

  test("an expanded thread offers every comment in it", () => {
    expect(visibleOverlayCommentIds(thread, new Set(), 0, false)).toEqual(["a1", "a2"])
  })

  test("a collapsed thread is one row — its root", () => {
    const resolved = thread.map((c) => ({ ...c, isThreadResolved: true }))

    expect(visibleOverlayCommentIds(resolved, new Set(), 0, false)).toEqual(["a1"])
  })

  test("only what is on screen: the window follows the highlight", () => {
    const many = Array.from({ length: 40 }, (_, i) => comment(`c${i}`, i + 1))

    const top = visibleOverlayCommentIds(many, new Set(), 0, false)
    expect(top).toEqual(many.slice(0, 24).map((c) => c.id))

    // Standing at the end, the window has moved down with the cursor.
    const bottom = visibleOverlayCommentIds(many, new Set(), 39, false)
    expect(bottom).toContain("c39")
    expect(bottom).not.toContain("c0")
  })
})
