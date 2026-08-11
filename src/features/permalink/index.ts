/**
 * Permalink Feature
 *
 * Copies a GitHub blob URL for the current selection, line, or file,
 * pinned to the PR head branch (or the local branch/bookmark).
 */

export {
  handleCopyPermalink,
  handleCopyPrDiffLink,
  handleCopyCommentLink,
  detectPermalinkScope,
  type PermalinkContext,
  type PermalinkScope,
} from "./handlers"
export { buildPermalinkUrl, buildPrDiffUrl, parseRemoteUrl, type RepoRef } from "./url"
