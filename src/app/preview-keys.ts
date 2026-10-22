import type { RiffKeymap } from "./keymap"
import type { AppKeyContext } from "./key-context"
import { reviewCandidates } from "../utils/publishable"
import { registerReviewPreviewKeys } from "../features/review-preview"
import { registerSyncPreviewKeys } from "../features/sync-preview"
import * as commentsFeature from "../features/comments"
import * as prOperations from "../features/pr-operations"

/** The sync preview's and Submit Review's layers, wired to the PR operations they end in. */
export function registerPreviewKeys(riffKeymap: RiffKeymap, ctx: AppKeyContext): void {
  const { render } = ctx
  // Later registration wins, and the sync preview outranks Submit Review,
  // so it registers after it.
  registerReviewPreviewKeys(riffKeymap, {
    reviewPreview: ctx.reviewPreview,
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
    syncPreview: ctx.syncPreview,
    render,
    onExecuteSync: () => prOperations.handleExecuteSync(ctx.prOperationsContext),
  })
}
