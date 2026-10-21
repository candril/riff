import { test, expect } from "bun:test"
import { createInitialState, type AppState } from "../state"
import type { Comment } from "../types"
import { commentsSeenOnScreen } from "./comments-seen"

const comment = (id: string, line: number): Comment => ({
  id,
  filename: "a.ts",
  line,
  side: "RIGHT",
  body: id,
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
})

const base: AppState = {
  ...createInitialState([], [], "", ""),
  comments: [comment("c2", 9), comment("c1", 3)],
  viewMode: "diff",
}
const overlayOpen = (s: AppState): AppState => ({ ...s, inlineCommentOverlay: { ...s.inlineCommentOverlay, open: true } })

test("the comments panel's comments are seen only while it is open", () => {
  expect(commentsSeenOnScreen(base, { conversationOpen: false })).toEqual([])
  expect(commentsSeenOnScreen(overlayOpen(base), { conversationOpen: false })).toEqual(["c1", "c2"])
})

test("an open Conversation section counts only on the overview", () => {
  expect(commentsSeenOnScreen({ ...base, viewMode: "state" }, { conversationOpen: true })).toEqual(["c2", "c1"])
  expect(commentsSeenOnScreen({ ...base, viewMode: "state" }, { conversationOpen: false })).toEqual([])
  expect(commentsSeenOnScreen(base, { conversationOpen: true })).toEqual([])
})

test("both together count the panel's comments, then the conversation's", () => {
  expect(commentsSeenOnScreen(overlayOpen({ ...base, viewMode: "state" }), { conversationOpen: true })).toEqual([
    "c1",
    "c2",
    "c2",
    "c1",
  ])
})
