import { expect, test } from "bun:test"
import { createCommentDraftsState, draftIn, draftOn } from "./drafts-state"

const line = { filename: "src/app.ts", line: 42, side: "RIGHT" } as const

test("a draft is kept against the line and side it was written on", () => {
  const drafts = createCommentDraftsState()
  drafts.remember(line, "half a thought")

  expect(drafts.on(line)).toBe("half a thought")
  expect(drafts.on({ ...line, line: 43 })).toBe("")
  expect(drafts.on({ ...line, side: "LEFT" })).toBe("")
  expect(drafts.on({ ...line, filename: "src/other.ts" })).toBe("")
})

test("a draft left while editing belongs to the comment, not the line", () => {
  const drafts = createCommentDraftsState()
  drafts.remember(draftOn({ ...line, editingId: "comment-1" }), "a rewrite")

  expect(drafts.on(line)).toBe("")
  expect(drafts.on({ editingId: "comment-1" })).toBe("a rewrite")
  expect(drafts.on({ editingId: "comment-2" })).toBe("")
})

test("the composer's line keys the draft when it edits nothing", () => {
  expect(draftOn({ ...line, editingId: null })).toEqual(line)
})

test("an empty draft throws the kept one away", () => {
  const drafts = createCommentDraftsState()
  drafts.remember(line, "half a thought")
  drafts.remember(line, "   ")

  expect(drafts.on(line)).toBe("")
  expect(drafts.drafts().size).toBe(0)
})

test("a saved draft is forgotten", () => {
  const drafts = createCommentDraftsState()
  drafts.remember(line, "half a thought")
  drafts.forget(line)

  expect(drafts.on(line)).toBe("")
})

test("each change sets a new map, and a forget with nothing there keeps the same one", () => {
  const drafts = createCommentDraftsState()
  const empty = drafts.drafts()
  drafts.remember(line, "half a thought")
  const kept = drafts.drafts()

  expect(kept).not.toBe(empty)
  expect(empty.size).toBe(0)
  drafts.forget({ editingId: "comment-1" })
  expect(drafts.drafts()).toBe(kept)
})

test("holds says whether a text is kept anywhere", () => {
  const drafts = createCommentDraftsState()
  drafts.remember({ editingId: "comment-1" }, "a rewrite")

  expect(drafts.holds("a rewrite")).toBe(true)
  expect(drafts.holds("something else")).toBe(false)
})

test("clear drops every draft, and leaves an empty map alone", () => {
  const drafts = createCommentDraftsState()
  const empty = drafts.drafts()
  drafts.clear()
  expect(drafts.drafts()).toBe(empty)

  drafts.remember(line, "half a thought")
  drafts.remember({ editingId: "comment-1" }, "a rewrite")
  drafts.clear()
  expect(drafts.drafts().size).toBe(0)
})

test("draftIn reads a handed-over map with the factory's keying", () => {
  const drafts = createCommentDraftsState()
  drafts.remember(line, "half a thought")
  const map = drafts.drafts()

  expect(draftIn(map, line)).toBe("half a thought")
  expect(draftIn(map, { editingId: "comment-1" })).toBe("")
})
