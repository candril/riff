/**
 * Fetches GitHub's pending review for a PR riff just loaded: at startup, on a
 * PR refresh and on opening the branch's PR, each of which starts from no
 * draft.
 */

import { withPendingComments, type AppState } from "../../state"
import type { getPendingReview } from "../../providers/github/review"
import type { PrInfo } from "../../providers/github/types"
import type { PendingReviewState } from "./pending-state"

export interface LoadPendingReviewContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  pendingReview: Pick<PendingReviewState, "set">
  fetch: typeof getPendingReview
}

export async function loadPendingReview(
  ctx: LoadPendingReviewContext,
  pr: Pick<PrInfo, "owner" | "repo" | "number">
): Promise<void> {
  const review = await ctx.fetch(pr.owner, pr.repo, pr.number).catch(() => undefined)
  // A draft riff cannot fetch is one Submit Review goes without, not an error.
  if (review === undefined) return
  // The reader may have moved to another PR or back to local while gh was
  // awaited, and this draft's id would then submit into the wrong review.
  if (!showing(ctx.getState(), pr)) return
  ctx.pendingReview.set(review)
  ctx.setState((s) => withPendingComments(s, review))
  ctx.render()
}

function showing(state: AppState, pr: Pick<PrInfo, "owner" | "repo" | "number">): boolean {
  const shown = state.appMode === "pr" ? state.prInfo : null
  return shown?.owner === pr.owner && shown.repo === pr.repo && shown.number === pr.number
}
