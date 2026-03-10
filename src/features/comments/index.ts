/**
 * Comments Feature
 *
 * Provides comment creation and submission functionality.
 * - c: add comment on current line/selection
 * - S: submit single comment immediately
 */

export {
  validateCommentsForSubmit,
  persistComment,
  handleAddComment,
  getCurrentComment,
  handleSubmitSingleComment,
  type CommentsContext,
} from "./handlers"
