/**
 * Comments View Feature
 *
 * Provides comments view panel navigation and actions.
 * - j/k navigation through comments and threads
 * - / to search/filter comments by body, author, or filename
 * - Enter to jump to comment in diff view
 * - r to reply to comment
 * - S to submit local comment
 * - x to toggle thread resolved
 * - h/l to collapse/expand threads
 */

export { handleInput, handleSearchInput, getFilteredNavItems, type CommentsViewInputContext } from "./input"
export { filterCommentsBySearch } from "./search"
