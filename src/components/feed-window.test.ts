import { test, expect, describe } from "bun:test"
import { FEED_CHROME_ROWS, feedRowsInView, feedWindow } from "./feed-window"
import { emptyFeed, type FeedRow, type FeedState } from "../features/feed/types"
import type { FeedEvent } from "../utils/feed"

const comment = (id: string): FeedEvent => ({
  id,
  type: "comment",
  at: "2026-03-01T12:00:00Z",
  title: id,
  target: { kind: "comment", commentId: id },
})
const commit = (sha: string): FeedEvent => ({
  id: `commit-${sha}`,
  type: "commit",
  at: "2026-03-01T12:00:00Z",
  title: sha,
  target: { kind: "commit", sha },
})

const rowsOf = (events: FeedEvent[]): FeedRow[] => events.map((event) => ({ kind: "event", event }))
const feedOf = (over: Partial<FeedState> = {}): FeedState => ({ ...emptyFeed(), ...over })
const comments = (n: number) => Array.from({ length: n }, (_, i) => comment(`c${i}`))

// Ten lines of room.
const HEIGHT = 10 + FEED_CHROME_ROWS

describe("the feed's window", () => {
  test("leaves a feed that fits as it is", () => {
    const rows = rowsOf(comments(4))
    expect(feedWindow(rows, feedOf({ highlightIndex: 3 }), HEIGHT)).toEqual([0, 1, 2, 3].map((index) => ({ kind: "row", index })))
  })

  test("ends at the last row when the highlight is on it", () => {
    expect(feedRowsInView(rowsOf(comments(30)), feedOf({ highlightIndex: 29 }), HEIGHT)).toEqual(
      Array.from({ length: 10 }, (_, i) => 20 + i)
    )
  })

  test("centres a highlight in the middle", () => {
    expect(feedRowsInView(rowsOf(comments(30)), feedOf({ highlightIndex: 15 }), HEIGHT)).toEqual(
      Array.from({ length: 10 }, (_, i) => 10 + i)
    )
  })

  test("starts at the first row when the highlight is on it", () => {
    expect(feedRowsInView(rowsOf(comments(30)), feedOf({ highlightIndex: 0 }), HEIGHT)).toEqual(
      Array.from({ length: 10 }, (_, i) => i)
    )
  })

  test("counts a commit's loading line as a line, while the highlight keeps indexing rows", () => {
    const events = [...comments(3), commit("abc"), ...comments(26)]
    const feed = feedOf({ highlightIndex: 3, expandedIds: new Set(["commit-abc"]) })
    const lines = feedWindow(rowsOf(events), feed, HEIGHT)
    expect(lines).toHaveLength(10)
    expect(lines.slice(0, 5)).toEqual([
      { kind: "row", index: 0 },
      { kind: "row", index: 1 },
      { kind: "row", index: 2 },
      { kind: "row", index: 3 },
      { kind: "loading", index: 3 },
    ])
    expect(lines.at(-1)).toEqual({ kind: "row", index: 8 })
  })

  test("keeps one line on a terminal too short for any", () => {
    expect(feedRowsInView(rowsOf(comments(5)), feedOf({ highlightIndex: 4 }), 3)).toEqual([4])
  })
})

describe("flash in the feed", () => {
  test("labels only the rows on screen, the loading line not among them", () => {
    const events = [...comments(20), commit("abc"), ...comments(20)]
    const feed = feedOf({ highlightIndex: 20, expandedIds: new Set(["commit-abc"]) })
    expect(feedRowsInView(rowsOf(events), feed, HEIGHT)).toEqual([15, 16, 17, 18, 19, 20, 21, 22, 23])
  })
})
