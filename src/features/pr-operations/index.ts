/**
 * PR Operations Feature
 *
 * Provides PR-specific operations.
 * - gs: sync local edits and replies to GitHub
 * - x: toggle thread resolution
 * - gS (confirm): submit review with comments
 */

export {
  handleExecuteSync,
  handleToggleThreadResolved,
  handleConfirmReview,
  type PrOperationsContext,
} from "./handlers"
