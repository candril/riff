/**
 * The real factory behind every feature a switch to another review resets,
 * typed in full so a test can open each one before the switch closes it.
 */

import { createHelpState } from "../features/help/state"
import { createConfirmState } from "../features/confirm/state"
import { createSyncPreviewState } from "../features/sync-preview/state"
import { createReviewPreviewState } from "../features/review-preview/state"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createActionMenuState } from "../features/action-menu/state"
import { createLinePeekState } from "../features/line-peek/state"
import { createBlamePeekState } from "../features/blame/peek-state"
import { createBlameColumnsState } from "../features/blame/column-state"
import { createCommentDraftsState } from "../features/inline-comment-overlay/drafts-state"
import { createComposerPickersState } from "../features/inline-comment-overlay/composer-pickers-state"
import { createCodePeekState } from "../features/inline-comment-overlay/code-peek-state"
import { createJumpListState } from "../features/jumplist/state"
import { createPendingReviewState } from "../features/review-preview/pending-state"
import { createPrCommentInputState } from "../features/pr-info-panel/comment-input-state"
import { createPrInfoFilterState } from "../features/pr-info-panel/filter-state"
import { createFileContentState } from "../features/file-content/state"
import { createCommitDiffsState } from "../features/commit-scope/diffs-state"
import { createBlockFoldsState } from "../features/folds/block-folds-state"
import { createFileFoldsState } from "../features/folds/file-folds-state"
import { createChatColumnState } from "../features/chat/column-state"
import type { AnotherReviewFeatures } from "../features/refresh/another-review"

export function createAnotherReviewFeatures() {
  return {
    help: createHelpState(),
    confirm: createConfirmState(),
    syncPreview: createSyncPreviewState(),
    reviewPreview: createReviewPreviewState(),
    filePicker: createFilePickerState(),
    commentsPicker: createCommentsPickerState(),
    occurrencePicker: createOccurrencePickerState(),
    marksPicker: createMarksPickerState(),
    commitPicker: createCommitPickerState(),
    actionMenu: createActionMenuState(),
    linePeek: createLinePeekState(),
    blamePeek: createBlamePeekState(),
    blameColumns: createBlameColumnsState(),
    commentDrafts: createCommentDraftsState(),
    composerPickers: createComposerPickersState(),
    codePeek: createCodePeekState(),
    jumpList: createJumpListState(),
    pendingReview: createPendingReviewState(),
    prCommentInput: createPrCommentInputState(),
    prInfoFilter: createPrInfoFilterState(),
    fileContent: createFileContentState(),
    commitDiffs: createCommitDiffsState(),
    blockFolds: createBlockFoldsState(),
    fileFolds: createFileFoldsState(),
    chatColumn: createChatColumnState(),
  } satisfies AnotherReviewFeatures
}
