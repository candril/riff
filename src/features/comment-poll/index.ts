/**
 * Comment Poll Feature
 *
 * Silently refreshes PR review comments in the background so replies and new
 * threads appear without a manual refresh.
 */

export { startCommentPoll, type CommentPollContext } from "./poll"
