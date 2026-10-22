import { describe, expect, test } from "bun:test"
import { createReviewPreviewState } from "./state"

describe("Submit Review's state", () => {
  test("show opens it afresh, dropping a previous session's body, exclusions, type, highlight and section", () => {
    const reviewPreview = createReviewPreviewState()
    reviewPreview.show()
    reviewPreview.setBody("Ship it")
    reviewPreview.toggleComment("c1")
    reviewPreview.setEvent("APPROVE")
    reviewPreview.moveHighlight(2, 5)
    reviewPreview.toggleSection()
    reviewPreview.close()

    reviewPreview.show()
    expect(reviewPreview.open()).toBe(true)
    expect(reviewPreview.snapshot()).toEqual({
      selectedEvent: "COMMENT",
      loading: false,
      error: undefined,
      body: "",
      excludedCommentIds: new Set(),
      highlightedIndex: 0,
      focusedSection: "comments",
    })
  })

  test("close keeps the body but clears loading and the error", () => {
    const reviewPreview = createReviewPreviewState()
    reviewPreview.show()
    reviewPreview.setBody("Ship it")
    reviewPreview.fail("Boom")
    reviewPreview.startSubmit()
    reviewPreview.close()
    expect(reviewPreview.open()).toBe(false)
    expect(reviewPreview.snapshot()).toMatchObject({ body: "Ship it", loading: false, error: undefined })
  })

  test("fail sets the error and ends the submit", () => {
    const reviewPreview = createReviewPreviewState()
    reviewPreview.show()
    reviewPreview.startSubmit()
    expect(reviewPreview.loading()).toBe(true)
    reviewPreview.fail("Boom")
    expect([reviewPreview.loading(), reviewPreview.error()]).toEqual([false, "Boom"])
  })

  test("moveHighlight stops at the first comment and at maxIndex", () => {
    const reviewPreview = createReviewPreviewState()
    reviewPreview.show()
    reviewPreview.moveHighlight(-1, 2)
    expect(reviewPreview.highlightedIndex()).toBe(0)
    reviewPreview.moveHighlight(5, 2)
    expect(reviewPreview.highlightedIndex()).toBe(2)
    reviewPreview.moveHighlight(-1, 2)
    expect(reviewPreview.highlightedIndex()).toBe(1)
  })

  test("toggleComment leaves a comment out, then takes it back, never changing a set already read", () => {
    const reviewPreview = createReviewPreviewState()
    reviewPreview.show()
    const before = reviewPreview.excludedCommentIds()
    reviewPreview.toggleComment("c1")
    expect([...reviewPreview.excludedCommentIds()]).toEqual(["c1"])
    expect(before.size).toBe(0)
    reviewPreview.toggleComment("c1")
    expect(reviewPreview.excludedCommentIds().size).toBe(0)
  })
})
