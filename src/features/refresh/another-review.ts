/**
 * What a switch to another review closes: creating a PR and opening the
 * branch's PR both put a different review on screen. They rebuild AppState
 * from createInitialState, which never reaches the feature factories' own
 * state (ADR-003), so whatever one review left open in them has to be closed
 * here or it carries over into the next. A reload, which adoptReloadedState
 * handles, is not a switch: it keeps the overview filter, and it stamps the
 * refresh time itself.
 */

import type { HelpState } from "../help/state"
import type { ConfirmState } from "../confirm/state"
import type { SyncPreviewState } from "../sync-preview/state"
import type { ReviewPreviewState } from "../review-preview/state"
import type { FilePickerState } from "../file-picker/state"
import type { CommentsPickerState } from "../comments-picker/state"
import type { OccurrencePickerState } from "../occurrence-picker/state"
import type { MarksPickerState } from "../marks/picker-state"
import type { CommitPickerState } from "../commit-picker/state"
import type { ActionMenuState } from "../action-menu/state"
import type { LinePeekState } from "../line-peek/state"
import type { BlamePeekState } from "../blame/peek-state"
import type { BlameColumnsState } from "../blame/column-state"
import type { CommentDraftsState } from "../inline-comment-overlay/drafts-state"
import type { JumpListState } from "../jumplist/state"
import type { PendingReviewState } from "../review-preview/pending-state"
import type { PrCommentInputState } from "../pr-info-panel/comment-input-state"
import type { PrInfoFilterState } from "../pr-info-panel/filter-state"
import type { FileContentState } from "../file-content/state"
import type { CommitDiffsState } from "../commit-scope/diffs-state"
import type { BlockFoldsState } from "../folds/block-folds-state"

export interface AnotherReviewFeatures {
  help: Pick<HelpState, "close">
  confirm: Pick<ConfirmState, "close">
  syncPreview: Pick<SyncPreviewState, "close">
  reviewPreview: Pick<ReviewPreviewState, "close">
  filePicker: Pick<FilePickerState, "close">
  commentsPicker: Pick<CommentsPickerState, "close">
  occurrencePicker: Pick<OccurrencePickerState, "close">
  marksPicker: Pick<MarksPickerState, "close">
  commitPicker: Pick<CommitPickerState, "close">
  actionMenu: Pick<ActionMenuState, "close">
  linePeek: Pick<LinePeekState, "close">
  blamePeek: Pick<BlamePeekState, "close">
  blameColumns: Pick<BlameColumnsState, "clear">
  commentDrafts: Pick<CommentDraftsState, "clear">
  jumpList: Pick<JumpListState, "clear">
  pendingReview: Pick<PendingReviewState, "clear">
  prCommentInput: Pick<PrCommentInputState, "close">
  prInfoFilter: Pick<PrInfoFilterState, "clear">
  fileContent: Pick<FileContentState, "clear">
  commitDiffs: Pick<CommitDiffsState, "clear">
  blockFolds: Pick<BlockFoldsState, "clear">
}

export function closeFeatureOverlays(features: AnotherReviewFeatures): void {
  features.help.close()
  features.confirm.close()
  features.syncPreview.close()
  features.reviewPreview.close()
  features.filePicker.close()
  features.commentsPicker.close()
  features.occurrencePicker.close()
  features.marksPicker.close()
  features.commitPicker.close()
  features.actionMenu.close()
  features.linePeek.close()
  features.blamePeek.close()
  features.blameColumns.clear()
  // A draft is keyed by file, line and side, and the new diff can put other
  // code on that line: kept, it would come back on the wrong one.
  features.commentDrafts.clear()
  // An entry's anchor names lines in the old diff.
  features.jumpList.clear()
  // This draft's id must not submit into another PR; a PR with a draft fetches its own.
  features.pendingReview.clear()
  // Half a comment on one PR must not post to the PR that replaced it.
  features.prCommentInput.close()
  // The text narrowed the last PR's rows; the next PR's overview opens unfiltered.
  features.prInfoFilter.clear()
  features.fileContent.clear()
  // The next PR's commits are not this one's.
  features.commitDiffs.clear()
  // A block id names a fence in the old diff.
  features.blockFolds.clear()
}
