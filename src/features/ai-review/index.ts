/**
 * AI Review feature
 *
 * Discuss a selection, folder, file, or the whole review with Claude Code
 * in a tmux split pane (or inline when not inside tmux).
 */

export {
  handleAiReviewContextAware,
  handleAiReviewFull,
  draftPathFor,
  type AiReviewContext,
} from "./handlers"
export {
  handleReviewDraftedComment,
  handleApproveDraftedComment,
  handleEditDraftedComment,
  handleDiscardDraftedComment,
  handleCancelDraftReview,
  startDraftPoller,
} from "./post-draft"
export {
  detectReviewScope,
  collectMultiSelectionFiles,
  getTreeMultiSelectionFilenames,
} from "./scope"
