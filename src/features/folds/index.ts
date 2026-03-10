/**
 * Folds Feature
 *
 * Provides fold operations across tree, comments, and diff views.
 * - gg/G: go to top/bottom
 * - za: toggle fold at cursor
 * - zo: open fold at cursor
 * - zc: close fold at cursor
 * - zR: expand all folds
 * - zM: collapse all folds
 */

export {
  handleGoToTop,
  handleGoToBottom,
  handleToggleFoldAtCursor,
  handleOpenFoldAtCursor,
  handleCloseFoldAtCursor,
  handleExpandAllFolds,
  handleCollapseAllFolds,
  type FoldsContext,
} from "./handlers"
