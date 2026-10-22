import { test, expect, describe } from "bun:test"
import {
  createInitialState,
  openInlineCommentOverlay,
  startInlineCompose,
  startInlineEdit,
  cancelInlineComposer,
  type AppState,
} from "./state"

function panelOpen(mode: "view" | "compose" = "view", anchor?: { draft?: string }): AppState {
  const state = createInitialState([], [], "local", "local changes")
  return openInlineCommentOverlay(state, "src/app.ts", 42, "RIGHT", mode, undefined, undefined, anchor)
}

describe("a draft the caller hands over", () => {
  test("fills the composer the diff opens straight into", () => {
    expect(panelOpen("compose", { draft: "half a thought" }).inlineCommentOverlay.input).toBe("half a thought")
  })

  test("stays out of the way in view mode", () => {
    expect(panelOpen("view", { draft: "half a thought" }).inlineCommentOverlay.input).toBe("")
  })

  test("fills the composer the panel switches into", () => {
    const kept = cancelInlineComposer(startInlineCompose(panelOpen(), "half a thought"))

    expect(kept.inlineCommentOverlay.input).toBe("")
    expect(startInlineCompose(kept, "half a thought").inlineCommentOverlay.input).toBe("half a thought")
    expect(startInlineCompose(kept).inlineCommentOverlay.input).toBe("")
  })

  test("fills an edit of a comment", () => {
    const editing = startInlineEdit(panelOpen(), "comment-1", "a rewrite")

    expect(editing.inlineCommentOverlay.input).toBe("a rewrite")
    expect(editing.inlineCommentOverlay.editingId).toBe("comment-1")
  })
})
