import { describe, expect, test } from "bun:test"
import { visibleOverlayCommentIds, windowThreads } from "./thread-panel-window"
import { threadTextWidth } from "./thread-rows-estimate"
import type { Comment } from "../types"

const UNKNOWN = { textWidth: 42, viewportRows: 0 }

function comment(id: string, line: number, inReplyTo?: string, body = id): Comment {
  return {
    id,
    filename: "parser.ts",
    line,
    side: "RIGHT",
    body,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    inReplyTo,
  }
}

describe("the rows flash can label", () => {
  const thread = [comment("a1", 10), comment("a2", 10, "a1")]

  test("an expanded thread offers every comment in it", () => {
    expect(visibleOverlayCommentIds(thread, new Set(), 0, false, UNKNOWN)).toEqual(["a1", "a2"])
  })

  test("a collapsed thread is one row — its root", () => {
    const resolved = thread.map((c) => ({ ...c, isThreadResolved: true }))

    expect(visibleOverlayCommentIds(resolved, new Set(), 0, false, UNKNOWN)).toEqual(["a1"])
  })

  test("only what is on screen: the window follows the highlight", () => {
    const many = Array.from({ length: 40 }, (_, i) => comment(`c${i}`, i + 1))

    const top = visibleOverlayCommentIds(many, new Set(), 0, false, UNKNOWN)
    expect(top).toEqual(many.slice(0, 24).map((c) => c.id))

    // Standing at the end, the window has moved down with the cursor.
    const bottom = visibleOverlayCommentIds(many, new Set(), 39, false, UNKNOWN)
    expect(bottom).toContain("c39")
    expect(bottom).not.toContain("c0")
  })
})

describe("the threads kept above the highlighted one", () => {
  const textWidth = threadTextWidth(48)
  // One paragraph that wraps to about thirty rows of a root's body column.
  const long = "word ".repeat(Math.ceil((textWidth * 30) / 5))
  const longThreads = [comment("l1", 1, undefined, long), comment("l2", 2, undefined, long)]
  const short = [comment("s1", 1), comment("s2", 2)]
  const target = comment("t", 3)
  const firstDrawn = (comments: Comment[], viewportRows: number) =>
    windowThreads(comments, new Set(), 2, false, { textWidth, viewportRows }).window.threads[0]!.thread.comments[0]!.id

  test("are none when the threads above would push it past the panel's foot", () => {
    expect(firstDrawn([...longThreads, target], 18)).toBe("t")
  })

  for (const viewportRows of [18, 40]) {
    test(`are two when two short threads fit in the rows the highlighted one leaves, ${viewportRows} rows`, () => {
      expect(firstDrawn([...short, target], viewportRows)).toBe("s1")
    })
  }

  test("are kept in a third of the panel when the highlighted thread fills it", () => {
    const tall = comment("t", 3, undefined, long)
    expect(firstDrawn([...short, tall], 18)).toBe("s2")
  })

  test("are only the nearer one when two do not fit", () => {
    expect(firstDrawn([longThreads[0]!, short[1]!, target], 18)).toBe("s2")
  })

  test("are two before the panel's rows are known", () => {
    expect(firstDrawn([...longThreads, target], 0)).toBe("l1")
  })

  test("are the ones flash labels too", () => {
    const comments = [...longThreads, comment("x1", 10), comment("x2", 11), target]
    for (const viewportRows of [0, 18, 40]) {
      const budget = { textWidth, viewportRows }
      const { window } = windowThreads(comments, new Set(), 4, false, budget)
      const drawn = window.threads.flatMap(({ thread }) => thread.comments.map((c) => c.id))
      expect(visibleOverlayCommentIds(comments, new Set(), 4, false, budget)).toEqual(drawn)
    }
  })
})
