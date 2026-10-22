/**
 * Fetches GitHub's pending review for a PR. gh can take seconds, and the
 * draft it brings back must not land on a review that has moved on since.
 */

import { withPendingComments, type AppState } from "../../state"
import type { getPendingReview } from "../../providers/github/review"
import type { PrInfo } from "../../providers/github/types"
import type { PendingReviewState } from "./pending-state"

export interface LoadPendingReviewContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  pendingReview: Pick<PendingReviewState, "set" | "generation">
  fetch: typeof getPendingReview
}

export async function loadPendingReview(
  ctx: LoadPendingReviewContext,
  pr: Pick<PrInfo, "owner" | "repo" | "number">
): Promise<void> {
  const asked = ctx.pendingReview.generation()
  const review = await ctx.fetch(pr.owner, pr.repo, pr.number).catch(() => undefined)
  // A draft riff cannot fetch is one Submit Review goes without, not an error.
  if (review === undefined) return
  // The reader may have moved to another PR or back to local while gh was
  // awaited, and this draft's id would then submit into the wrong review.
  if (!showing(ctx.getState(), pr)) return
  // Anything that dropped or replaced the draft while gh was awaited makes
  // this one stale, and a submitted draft's id must never come back.
  if (ctx.pendingReview.generation() !== asked) return
  ctx.pendingReview.set(review)
  ctx.setState((s) => withPendingComments(s, review))
  ctx.render()
}

function showing(state: AppState, pr: Pick<PrInfo, "owner" | "repo" | "number">): boolean {
  const shown = state.appMode === "pr" ? state.prInfo : null
  return shown?.owner === pr.owner && shown.repo === pr.repo && shown.number === pr.number
}
