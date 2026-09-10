/**
 * The code a comment was written against (spec 060).
 *
 * GitHub sends every review comment the `diff_hunk` it was made on, and riff
 * has been storing it all along. For an outdated comment that hunk is the
 * only copy of the code anywhere in the session: the diff shows the file as
 * it is now, and the lines the comment objected to are gone from it.
 */

import type { Comment } from "../../types"

export interface CommentHunk {
  /** The stored hunk, `@@` header and all. */
  hunk: string
  filename: string
  /** The line the comment was made on, as its author saw it. */
  line: number
  /** Whether the thread has drifted off the current head. */
  outdated: boolean
  /** True when the hunk came from the thread's root rather than this reply. */
  fromRoot: boolean
}

/**
 * The hunk to show for a comment, or nothing when there is none.
 *
 * A reply carries no hunk of its own — GitHub attaches one to the comment
 * that opened the thread — so a reply borrows the root's, which is the code
 * the whole conversation is about anyway.
 */
export function commentHunk(comments: readonly Comment[], id: string): CommentHunk | null {
  const comment = comments.find((candidate) => candidate.id === id)
  if (!comment) return null

  const root = comment.inReplyTo
    ? comments.find((candidate) => candidate.id === comment.inReplyTo)
    : undefined
  const source = comment.diffHunk?.trim() ? comment : root?.diffHunk?.trim() ? root : null
  if (!source?.diffHunk) return null

  return {
    hunk: source.diffHunk,
    filename: source.filename,
    line: source.line,
    outdated: source.outdated ?? root?.outdated ?? false,
    fromRoot: source !== comment,
  }
}
