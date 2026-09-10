import { test, expect, describe } from "bun:test"
import {
  createInitialState,
  openInlineCommentOverlay,
  startInlineCompose,
  startInlineEdit,
  cancelInlineComposer,
  rememberCommentDraft,
  forgetCommentDraft,
  commentDraftFor,
  type AppState,
} from "./state"

function panelOpen(mode: "view" | "compose" = "view"): AppState {
  const state = createInitialState([], [], "local", "local changes")
  return openInlineCommentOverlay(state, "src/app.ts", 42, "RIGHT", mode)
}

describe("a draft left with Esc", () => {
  test("is remembered against the line it was written on", () => {
    const state = rememberCommentDraft(startInlineCompose(panelOpen()), "half a thought")

    expect(commentDraftFor(state, "src/app.ts", 42, "RIGHT")).toBe("half a thought")
    expect(commentDraftFor(state, "src/app.ts", 43, "RIGHT")).toBe("")
    expect(commentDraftFor(state, "src/other.ts", 42, "RIGHT")).toBe("")
  })

  test("comes back the next time the composer opens there", () => {
    const kept = cancelInlineComposer(
      rememberCommentDraft(startInlineCompose(panelOpen()), "half a thought")
    )

    expect(kept.inlineCommentOverlay.input).toBe("")
    expect(startInlineCompose(kept).inlineCommentOverlay.input).toBe("half a thought")
  })

  test("comes back when the diff opens straight into the composer", () => {
    const kept = rememberCommentDraft(startInlineCompose(panelOpen()), "half a thought")
    const reopened = openInlineCommentOverlay(kept, "src/app.ts", 42, "RIGHT", "compose")

    expect(reopened.inlineCommentOverlay.input).toBe("half a thought")
  })

  test("stays out of the way in view mode", () => {
    const kept = rememberCommentDraft(startInlineCompose(panelOpen()), "half a thought")
    const reopened = openInlineCommentOverlay(kept, "src/app.ts", 42, "RIGHT")

    expect(reopened.inlineCommentOverlay.input).toBe("")
  })

  test("an empty one throws the old draft away", () => {
    const kept = rememberCommentDraft(startInlineCompose(panelOpen()), "half a thought")
    const cleared = rememberCommentDraft(kept, "   ")

    expect(commentDraftFor(cleared, "src/app.ts", 42, "RIGHT")).toBe("")
  })

  test("is dropped once the comment is saved", () => {
    const kept = rememberCommentDraft(startInlineCompose(panelOpen()), "half a thought")

    expect(commentDraftFor(forgetCommentDraft(kept), "src/app.ts", 42, "RIGHT")).toBe("")
  })
})

describe("a draft left while editing", () => {
  test("belongs to the comment, not the line", () => {
    const editing = startInlineEdit(panelOpen(), "comment-1", "the original")
    const kept = cancelInlineComposer(rememberCommentDraft(editing, "a rewrite"))

    // The line is untouched: a new comment there starts empty.
    expect(commentDraftFor(kept, "src/app.ts", 42, "RIGHT")).toBe("")
    // Editing the same comment again resumes the rewrite.
    expect(startInlineEdit(kept, "comment-1", "the original").inlineCommentOverlay.input).toBe(
      "a rewrite"
    )
    // A different comment gets its own body.
    expect(startInlineEdit(kept, "comment-2", "another body").inlineCommentOverlay.input).toBe(
      "another body"
    )
  })
})
