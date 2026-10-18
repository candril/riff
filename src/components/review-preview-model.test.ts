import { test, expect, describe } from "bun:test"
import { canSubmit, reviewPreviewModel, type ValidatedComment } from "./review-preview-model"
import type { ReviewPreviewState } from "../state"
import type { Comment } from "../types"

function comment(id: string, extra: Partial<Comment> = {}, valid = true): ValidatedComment {
  return {
    comment: {
      id,
      filename: "src/app/greet.ts",
      line: 3,
      side: "RIGHT",
      body: "Rename this",
      createdAt: "2026-01-10T10:00:00Z",
      status: "local",
      ...extra,
    },
    valid,
  }
}

function state(overrides: Partial<ReviewPreviewState> = {}): ReviewPreviewState {
  return {
    open: true,
    selectedEvent: "COMMENT",
    loading: false,
    body: "",
    excludedCommentIds: new Set(),
    highlightedIndex: 0,
    focusedSection: "comments",
    pendingReview: null,
    pendingReviewLoading: false,
    ...overrides,
  }
}

const pending = (count: number): ReviewPreviewState["pendingReview"] => ({
  id: 1,
  user: "octo",
  body: "",
  comments: Array.from({ length: count }, (_, i) => ({ id: i, body: "x", path: "a.ts", line: i, side: "RIGHT" as const })),
})

describe("canSubmit", () => {
  test("never approves or requests changes on your own PR", () => {
    expect(canSubmit(state({ selectedEvent: "APPROVE" }), 1, true)).toBe(false)
    expect(canSubmit(state({ selectedEvent: "REQUEST_CHANGES", body: "x" }), 1, true)).toBe(false)
    expect(canSubmit(state({ selectedEvent: "COMMENT" }), 1, true)).toBe(true)
  })

  test("a change request needs a comment or a summary", () => {
    expect(canSubmit(state({ selectedEvent: "REQUEST_CHANGES", body: "  " }), 0, false)).toBe(false)
    expect(canSubmit(state({ selectedEvent: "REQUEST_CHANGES", body: "Fix it" }), 0, false)).toBe(true)
    expect(canSubmit(state({ selectedEvent: "REQUEST_CHANGES" }), 1, false)).toBe(true)
  })

  test("a comment review needs a comment or a summary", () => {
    expect(canSubmit(state({ body: "\n" }), 0, false)).toBe(false)
    expect(canSubmit(state({ body: "Nice" }), 0, false)).toBe(true)
    expect(canSubmit(state(), 2, false)).toBe(true)
  })

  test("an approval needs neither", () => {
    expect(canSubmit(state({ selectedEvent: "APPROVE" }), 0, false)).toBe(true)
  })
})

describe("reviewPreviewModel", () => {
  test("names the three events and marks the selected one", () => {
    expect(reviewPreviewModel([], state({ selectedEvent: "APPROVE" }), false).chips).toEqual([
      { event: "COMMENT", label: "1: Comment", selected: false },
      { event: "APPROVE", label: "2: Approve", selected: true },
      { event: "REQUEST_CHANGES", label: "3: Request Changes", selected: false },
    ])
  })

  test("the banner says the pending review is loading, counts its comments, or is absent", () => {
    expect(reviewPreviewModel([], state({ pendingReviewLoading: true, pendingReview: pending(2) }), false).banner).toEqual({
      kind: "loading",
    })
    expect(reviewPreviewModel([], state({ pendingReview: pending(2) }), false).banner).toEqual({ kind: "pending", count: 2 })
    expect(reviewPreviewModel([], state(), false).banner).toBeNull()
  })

  test("says which section has focus", () => {
    expect(reviewPreviewModel([], state({ focusedSection: "input" }), false)).toMatchObject({
      summaryFocused: true,
      commentsFocused: false,
    })
    expect(reviewPreviewModel([], state(), false)).toMatchObject({ summaryFocused: false, commentsFocused: true })
  })

  test("lists valid comments with their checkbox, file name and line, and highlights the cursor only with focus", () => {
    const comments = [
      comment("a"),
      comment("b", { status: "pending", line: undefined }),
      comment("c", { filename: "README" }),
      comment("bad", {}, false),
    ]
    const model = reviewPreviewModel(comments, state({ excludedCommentIds: new Set(["b", "c"]), highlightedIndex: 1 }), false)
    expect(model.comments).toEqual([
      { id: "a", checkbox: "✓", checkboxTone: "included", fileLabel: "greet.ts:3", preview: "Rename this", highlighted: false },
      { id: "b", checkbox: "●", checkboxTone: "pending", fileLabel: "greet.ts:?", preview: "Rename this", highlighted: true },
      { id: "c", checkbox: "○", checkboxTone: "excluded", fileLabel: "README:3", preview: "Rename this", highlighted: false },
    ])
    expect(model).toMatchObject({ includedCount: 1, validCount: 3, moreCount: 0 })
    const unfocused = reviewPreviewModel(comments, state({ focusedSection: "input", highlightedIndex: 1 }), false)
    expect(unfocused.comments.map((row) => row.highlighted)).toEqual([false, false, false])
  })

  test("flattens whitespace and cuts a body over 40 characters with an ellipsis", () => {
    const rows = reviewPreviewModel(
      [comment("a", { body: "one\n\ntwo" }), comment("b", { body: "x".repeat(40) }), comment("c", { body: "y".repeat(41) })],
      state(),
      false
    ).comments
    expect(rows.map((row) => row.preview)).toEqual(["one two", "x".repeat(40), "y".repeat(40) + "…"])
  })

  test("lists at most six and counts the rest", () => {
    const comments = Array.from({ length: 9 }, (_, i) => comment(`c${i}`))
    const model = reviewPreviewModel(comments, state(), false)
    expect(model.comments.map((row) => row.id)).toEqual(["c0", "c1", "c2", "c3", "c4", "c5"])
    expect(model).toMatchObject({ moreCount: 3, includedCount: 9, validCount: 9 })
  })

  test("the footer says it is submitting, then shows an error, then why it cannot submit, then the keys", () => {
    const status = (overrides: Partial<ReviewPreviewState>, isOwnPr = false, comments: ValidatedComment[] = []) =>
      reviewPreviewModel(comments, state(overrides), isOwnPr).status
    expect(status({ loading: true, error: "Boom" })).toEqual({ text: "Submitting...", tone: "submitting" })
    expect(status({ error: "Boom" })).toEqual({ text: "Boom", tone: "error" })
    expect(status({ selectedEvent: "APPROVE" }, true)).toEqual({ text: "Cannot approve your own PR", tone: "hint" })
    expect(status({ selectedEvent: "REQUEST_CHANGES", body: "x" }, true)).toEqual({
      text: "Cannot request changes on your own PR",
      tone: "hint",
    })
    expect(status({})).toEqual({ text: "Add a comment or summary", tone: "hint" })
    expect(status({}, false, [comment("a")])).toEqual({ text: "Tab: switch · Enter: submit", tone: "idle" })
  })

  test("submitting is enabled only when allowed and not already under way", () => {
    expect(reviewPreviewModel([comment("a")], state(), false).submitEnabled).toBe(true)
    expect(reviewPreviewModel([comment("a")], state({ loading: true }), false).submitEnabled).toBe(false)
    expect(reviewPreviewModel([], state(), false).submitEnabled).toBe(false)
  })

  test("carries the body for the summary to start from", () => {
    expect(reviewPreviewModel([], state({ body: "Looks good" }), false).seedBody).toBe("Looks good")
  })

  test("is plain data that survives a JSON round trip", () => {
    const model = reviewPreviewModel(
      [comment("a"), comment("b")],
      state({ excludedCommentIds: new Set(["b"]), pendingReview: pending(1) }),
      false
    )
    expect(JSON.parse(JSON.stringify(model))).toEqual(model)
  })
})
