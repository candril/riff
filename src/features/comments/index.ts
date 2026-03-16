/**
 * Comments Feature
 *
 * Provides comment creation and submission functionality.
 * - c: add comment on current line/selection
 * - S: submit single comment immediately
 * - d: delete comment (local only)
 */

export {
  validateCommentsForSubmit,
  persistComment,
  handleAddComment,
  getCurrentComment,
  handleSubmitSingleComment,
  handleDeleteComment,
  type CommentsContext,
} from "./handlers"
