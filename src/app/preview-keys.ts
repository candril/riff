import type { RiffKeymap } from "./keymap"
import type { GlobalKeyContext } from "./global-keys"
import { reviewCandidates } from "../utils/publishable"
import { registerReviewPreviewKeys } from "../features/review-preview"
import { registerSyncPreviewKeys } from "../features/sync-preview"
import * as commentsFeature from "../features/comments"
import * as prOperations from "../features/pr-operations"

/** The sync preview's and Submit Review's layers, wired to the PR operations they end in. */
export function registerPreviewKeys(riffKeymap: RiffKeymap, ctx: GlobalKeyContext): void {
  const { getState, setState, render } = ctx
  // Later registration wins, and the chain these layers replaced asked the
  // sync preview before Submit Review.
  registerReviewPreviewKeys(riffKeymap, {
    getState,
    setState,
    render,
    getValidatedComments: () => {
      const state = ctx.getState()
      return commentsFeature.validateCommentsForSubmit(reviewCandidates(state.comments), state.files)
    },
    isOwnPr: () => {
      const { prInfo } = ctx.getState()
      return prInfo !== null && ctx.reviewPreviewOpenContext.getCachedCurrentUser() === prInfo.author
    },
    onConfirmReview: () => prOperations.handleConfirmReview(ctx.prOperationsContext),
    readSummary: () => ctx.readReviewSummary(),
  })
  registerSyncPreviewKeys(riffKeymap, {
    getState,
    setState,
    render,
    onExecuteSync: () => prOperations.handleExecuteSync(ctx.prOperationsContext),
  })
}
