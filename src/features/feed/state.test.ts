import { test, expect, describe } from "bun:test"
import type { FeedEvent } from "../../utils/feed"
import { createFeedState } from "./state"
import { emptyFeed, type CommitFileSummary } from "./types"

const event = (id: string): FeedEvent => ({ id, type: "comment", at: "2026-01-01T00:00:00Z", title: id })
const FILES: CommitFileSummary[] = [{ filename: "a.ts", additions: 1, deletions: 0 }]

describe("createFeedState", () => {
  test("starts as the empty feed", () => {
    expect(createFeedState().snapshot()).toEqual(emptyFeed())
  })

  test("move walks the highlight and clamps it to the rows on screen", () => {
    const feed = createFeedState()
    feed.move(2, 5)
    expect(feed.highlightIndex()).toBe(2)
    feed.move(10, 5)
    expect(feed.highlightIndex()).toBe(4)
    feed.move(-10, 5)
    expect(feed.highlightIndex()).toBe(0)
  })

  test("move with no rows stays on the first", () => {
    const feed = createFeedState()
    feed.move(1, 0)
    expect(feed.highlightIndex()).toBe(0)
  })

  test("highlight puts the highlight on a row", () => {
    const feed = createFeedState()
    feed.highlight(7)
    expect(feed.highlightIndex()).toBe(7)
  })

  test("toggleType turns a type on and off, and goes back to the first row", () => {
    const feed = createFeedState()
    feed.highlight(3)
    feed.toggleType("commit")
    expect(feed.types()).toEqual(new Set(["commit"]))
    expect(feed.highlightIndex()).toBe(0)
    feed.toggleType("commit")
    expect(feed.types().size).toBe(0)
  })

  test("showAll puts everything back: every type, seen or not, no text, prompt closed", () => {
    const feed = createFeedState()
    feed.toggleType("commit")
    feed.toggleUnseen()
    feed.startFilter()
    feed.setFilter("x")
    feed.highlight(2)
    feed.showAll()
    expect(feed.snapshot()).toMatchObject({
      types: new Set(),
      unseenOnly: false,
      filter: "",
      filterInput: false,
      highlightIndex: 0,
    })
  })

  test("toggleUnseen flips unseen-only and goes back to the first row", () => {
    const feed = createFeedState()
    feed.highlight(3)
    feed.toggleUnseen()
    expect(feed.snapshot()).toMatchObject({ unseenOnly: true, highlightIndex: 0 })
    feed.toggleUnseen()
    expect(feed.unseenOnly()).toBe(false)
  })

  test("toggleExpanded opens a row and closes it again", () => {
    const feed = createFeedState()
    feed.toggleExpanded("commit-abc")
    expect(feed.expandedIds()).toEqual(new Set(["commit-abc"]))
    feed.toggleExpanded("commit-abc")
    expect(feed.expandedIds().size).toBe(0)
  })

  test("startLoading marks the feed loading, and setEvents lands the stream and ends it", () => {
    const feed = createFeedState()
    feed.startLoading()
    expect(feed.loading()).toBe(true)
    feed.setEvents([event("a")])
    expect(feed.snapshot()).toMatchObject({ events: [event("a")], loading: false })
  })

  test("setCommitFiles keeps each commit's files beside the others", () => {
    const feed = createFeedState()
    feed.setCommitFiles("abc", FILES)
    feed.setCommitFiles("def", [])
    expect(feed.commitFiles()).toEqual(new Map([["abc", FILES], ["def", []]]))
  })

  test("the filter: typing goes back to the first row, Enter keeps it, Escape drops it", () => {
    const feed = createFeedState()
    feed.highlight(4)
    feed.startFilter()
    feed.setFilter("carol")
    expect(feed.snapshot()).toMatchObject({ filter: "carol", filterInput: true, highlightIndex: 0 })
    feed.commitFilter()
    expect(feed.snapshot()).toMatchObject({ filter: "carol", filterInput: false })
    feed.startFilter()
    expect(feed.snapshot()).toMatchObject({ filter: "carol", filterInput: true })
    feed.clearFilter()
    expect(feed.snapshot()).toMatchObject({ filter: "", filterInput: false })
  })

  test("forgetStream drops the events and commit files and keeps where the reader stood", () => {
    const feed = createFeedState()
    feed.setEvents([event("a"), event("b")])
    feed.setCommitFiles("abc", FILES)
    feed.highlight(1)
    feed.toggleType("comment")
    feed.toggleExpanded("commit-abc")
    feed.toggleUnseen()
    feed.highlight(1)
    feed.forgetStream()
    expect(feed.snapshot()).toEqual({
      ...emptyFeed(),
      highlightIndex: 1,
      types: new Set(["comment"]),
      expandedIds: new Set(["commit-abc"]),
      unseenOnly: true,
    })
  })

  test("reset goes back to the empty feed", () => {
    const feed = createFeedState()
    feed.setEvents([event("a")])
    feed.setCommitFiles("abc", FILES)
    feed.toggleType("comment")
    feed.toggleExpanded("commit-abc")
    feed.startFilter()
    feed.setFilter("x")
    feed.highlight(3)
    feed.startLoading()
    feed.reset()
    expect(feed.snapshot()).toEqual(emptyFeed())
  })
})
