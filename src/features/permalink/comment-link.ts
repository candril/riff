/**
 * Links to individual comments.
 *
 * GitHub anchors each comment on the PR page — `#discussion_r<id>` for a
 * review comment, `#issuecomment-<id>` for a conversation comment,
 * `#pullrequestreview-<id>` for a review summary. The API hands us those URLs
 * directly for most objects; the anchors are reconstructed when it doesn't,
 * which keeps this working for comments riff has only seen through a
 * lightweight fetch.
 */

import type { AppState } from "../../state"
import type { Comment } from "../../types"

export type CommentLink =
  | { ok: true; url: string; label: string }
  | { ok: false; reason: string }

/** Link to a review comment, i.e. one anchored on a line of the diff. */
export function linkForComment(state: AppState, comment: Comment): CommentLink {
  if (comment.githubUrl) {
    return { ok: true, url: comment.githubUrl, label: describeComment(comment) }
  }
  if (comment.githubId && state.prInfo) {
    return {
      ok: true,
      url: `${state.prInfo.url}#discussion_r${comment.githubId}`,
      label: describeComment(comment),
    }
  }
  return { ok: false, reason: "That comment isn't on GitHub yet — sync it first (gs)" }
}

/**
 * Link to whatever the view last marked as reactable (spec 042). That target
 * already tracks "the comment the user is looking at" across the inline
 * overlay and the PR info panel, so it doubles as the focus signal here.
 */
export function linkForFocusedTarget(state: AppState): CommentLink | null {
  const target = state.reactionTarget
  const pr = state.prInfo
  if (!target || !pr) return null

  switch (target.kind) {
    case "review-comment": {
      const comment = state.comments.find((c) => c.githubId === target.githubId)
      if (comment) return linkForComment(state, comment)
      return {
        ok: true,
        url: `${pr.url}#discussion_r${target.githubId}`,
        label: "review comment",
      }
    }
    case "issue-comment": {
      const conversation = pr.conversationComments?.find((c) => c.id === target.githubId)
      return {
        ok: true,
        url: conversation?.url ?? `${pr.url}#issuecomment-${target.githubId}`,
        label: conversation?.author ? `comment by @${conversation.author}` : "conversation comment",
      }
    }
    case "review": {
      const review = pr.reviews?.find((r) => r.databaseId === target.reviewId)
      return {
        ok: true,
        url: review?.url ?? `${pr.url}#pullrequestreview-${target.reviewId}`,
        label: review?.author ? `review by @${review.author}` : "review",
      }
    }
    case "issue":
      return { ok: true, url: pr.url, label: `PR #${target.prNumber}` }
  }
}

function describeComment(comment: Comment): string {
  const where = comment.line ? `${comment.filename}:${comment.line}` : comment.filename
  return comment.author ? `${where} (@${comment.author})` : where
}
