/**
 * GitHub's pending review: the draft the reader left on the PR's page, which
 * Submit Review merges its comments into. It is GitHub's state, not Submit
 * Review's own: it outlives the modal, is fetched on every load of a PR and
 * forgotten once a review is submitted. The feature owns it rather than
 * AppState, which sheds one slice per feature this way (spec 100, M6;
 * ADR-003).
 */

import { createSignal } from "solid-js"
import type { PendingReview } from "../../providers/github/types"

export type PendingReviewState = ReturnType<typeof createPendingReviewState>

export function createPendingReviewState() {
  const [review, setReview] = createSignal<PendingReview | null>(null)
  // Not a signal: nothing draws it, it only tells a fetch whether it is stale.
  let generation = 0

  return {
    /** Null outside a PR, and when the reader has no draft review on it. */
    review,
    generation: () => generation,
    set(next: PendingReview | null) {
      generation++
      setReview(next)
    },
    clear() {
      generation++
      setReview(null)
    },
  }
}
