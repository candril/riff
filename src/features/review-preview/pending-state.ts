/**
 * GitHub's pending review: the draft the reader left on the PR's page, which
 * Submit Review merges its comments into. It is GitHub's state, not Submit
 * Review's own: it outlives the modal and is only ever loaded at startup. The
 * feature owns it rather than AppState, which sheds one slice per feature
 * this way (spec 100, M6; ADR-003).
 */

import { createSignal } from "solid-js"
import type { PendingReview } from "../../providers/github/types"

export type PendingReviewState = ReturnType<typeof createPendingReviewState>

export function createPendingReviewState() {
  const [review, setReview] = createSignal<PendingReview | null>(null)

  return {
    /** Null outside a PR, and when the reader has no draft review on it. */
    review,
    set(next: PendingReview | null) {
      setReview(next)
    },
    clear() {
      setReview(null)
    },
  }
}
