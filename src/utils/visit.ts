/**
 * The visit watermark (spec 069).
 *
 * riff's own memory of when you last had this PR open — not a sync with
 * GitHub, and not a log: one record per PR, so that "what arrived since I
 * looked" is answerable at all.
 *
 * The mark is set when riff exits and when the PR is refreshed, never
 * continuously: the question is "since I last looked", and a live-updating
 * watermark answers "since a moment ago", which is never useful.
 */

import type { Comment } from "../types"

export interface VisitWatermark {
  /** When the PR was last open. */
  lastVisitAt: string
  /** The head it was at, so file changes since then can be found. */
  lastSeenHeadSha: string
  /**
   * Comments that had been on screen by then. Only the ones created after
   * `lastVisitAt` need keeping — everything older is seen by definition —
   * so the list stays small however long the PR lives.
   */
  seenCommentIds: string[]
}

export function createVisitWatermark(headSha = ""): VisitWatermark {
  return { lastVisitAt: new Date(0).toISOString(), lastSeenHeadSha: headSha, seenCommentIds: [] }
}

/**
 * Whether a comment arrived since the last visit and had not been read by
 * then.
 *
 * What is read *in this session* deliberately does not count here: a marker
 * that vanished the moment you looked at the panel would be gone before you
 * had read the thread it was pointing at. Reading takes effect at the next
 * visit, which is the question the watermark answers.
 */
export function isUnseen(comment: Comment, watermark: VisitWatermark | null): boolean {
  if (!watermark) return false
  if (watermark.seenCommentIds.includes(comment.id)) return false
  return comment.createdAt > watermark.lastVisitAt
}

export function unseenComments(
  comments: readonly Comment[],
  watermark: VisitWatermark | null
): Comment[] {
  return comments.filter((comment) => isUnseen(comment, watermark))
}

/** The files that have an unseen comment on them. */
export function filesWithUnseen(
  comments: readonly Comment[],
  watermark: VisitWatermark | null
): Set<string> {
  return new Set(unseenComments(comments, watermark).map((comment) => comment.filename))
}

/**
 * The watermark to write when leaving: now, at this head, remembering the
 * comments seen in this session — and only those the next visit could still
 * mistake for new.
 */
export function markVisit(
  comments: readonly Comment[],
  headSha: string,
  seenNow: ReadonlySet<string>,
  now = new Date().toISOString()
): VisitWatermark {
  const stillYoung = new Set(
    comments.filter((comment) => comment.createdAt > now).map((comment) => comment.id)
  )
  const seen = [...seenNow].filter((id) => stillYoung.has(id))
  return { lastVisitAt: now, lastSeenHeadSha: headSha, seenCommentIds: seen }
}

/**
 * Whether the head riff remembers is still part of the PR. When it is not,
 * the branch was rewritten under the reader and "40 files changed since your
 * last visit" would be a lie — riff says rebased and falls back to times.
 */
export function wasRebased(
  watermark: VisitWatermark | null,
  commits: readonly { sha: string }[],
  fetchLimit: number
): boolean {
  if (!watermark?.lastSeenHeadSha) return false
  if (commits.length === 0 || commits.length >= fetchLimit) return false
  return !commits.some((commit) => watermark.lastSeenHeadSha.startsWith(commit.sha))
}
