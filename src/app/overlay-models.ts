import { reviewCandidates } from "../utils/publishable"
import { version } from "../version"
import { getInlineCommentOverlayComments } from "../state"
import * as commentsFeature from "../features/comments"
import { toastModel } from "../components/notification-model"
import { confirmDialogModel } from "../components/confirm-dialog-model"
import { gatherSyncItems } from "../components/sync-items"
import { syncPreviewModel } from "../components/sync-preview-model"
import { reviewPreviewModel } from "../components/review-preview-model"
import { helpOverlayModel } from "../components/help-overlay-model"
import { blamePeekModel } from "../components/blame-peek-model"
import { diffPeekModel, hunkPeekModel } from "./peeks"
import type { Frame } from "./frame"

/** What each overlay draws for `frame`, or null while it is not shown. */
export function overlayModels({ state, vimState, mapping, cachedCurrentUser, width, height, now }: Frame) {
  const codePeekId = state.inlineCommentOverlay.open ? state.inlineCommentOverlay.codePeekId : null
  return {
    toast: state.toast.message ? toastModel(state.toast.message, state.toast.type) : null,
    confirmDialog: state.confirmDialog ? confirmDialogModel(state.confirmDialog) : null,
    helpOverlay: state.showHelp ? helpOverlayModel(version, state.helpScroll, height) : null,
    reviewPreview: state.reviewPreview.open
      ? reviewPreviewModel(
          commentsFeature.validateCommentsForSubmit(reviewCandidates(state.comments), state.files),
          state.reviewPreview,
          state.prInfo !== null && cachedCurrentUser === state.prInfo.author
        )
      : null,
    syncPreview: state.syncPreview.open ? syncPreviewModel(gatherSyncItems(state.comments), state.syncPreview) : null,
    diffPeek:
      state.showLinePeek && state.viewMode === "diff"
        ? diffPeekModel(mapping, vimState.line, state.peekSide, state.peekScroll, width, height)
        : null,
    blamePeek:
      state.blamePeek && state.viewMode === "diff"
        ? blamePeekModel({ ...state.blamePeek, now, terminalWidth: width, terminalHeight: height })
        : null,
    hunkPeek:
      codePeekId !== null ? hunkPeekModel(getInlineCommentOverlayComments(state), codePeekId, width, height) : null,
  }
}

export type OverlayModels = ReturnType<typeof overlayModels>
