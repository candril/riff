import { describe, expect, test } from "bun:test"
import type { PendingReview } from "../../providers/github/types"
import { createPendingReviewState } from "./pending-state"

const draft: PendingReview = {
  id: 7,
  user: "octo",
  body: "",
  comments: [{ id: 1, body: "Draft", path: "a.ts", line: 2, side: "RIGHT" }],
}

describe("createPendingReviewState", () => {
  test("starts with no review", () => {
    expect(createPendingReviewState().review()).toBeNull()
  })

  test("set takes the review, and null drops it", () => {
    const pending = createPendingReviewState()
    pending.set(draft)
    expect(pending.review()).toBe(draft)
    pending.set(null)
    expect(pending.review()).toBeNull()
  })

  test("clear drops the review", () => {
    const pending = createPendingReviewState()
    pending.set(draft)
    pending.clear()
    expect(pending.review()).toBeNull()
  })

  test("set and clear each move the generation on", () => {
    const pending = createPendingReviewState()
    const start = pending.generation()
    pending.set(draft)
    const afterSet = pending.generation()
    expect(afterSet).not.toBe(start)
    pending.clear()
    expect(pending.generation()).not.toBe(afterSet)
  })
})
