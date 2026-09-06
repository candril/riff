/**
 * Which local comments may leave the machine.
 *
 * A thread can be resolved locally with `x` before anything is synced. That
 * is how a local review says "done" — Claude fixed it, or the author changed
 * their mind — and a resolved-before-publish thread must never reach GitHub,
 * not through a review, a sync, or a single-comment post.
 */

import type { Comment } from "../types"

/**
 * True when the thread this comment belongs to was resolved while still
 * local. Replies inherit the state of their root; a reply whose root is
 * missing is treated as its own root.
 */
export function isLocallyResolved(comment: Comment, all: Comment[]): boolean {
  const root = comment.inReplyTo
    ? (all.find((c) => c.id === comment.inReplyTo) ?? comment)
    : comment
  return root.status === "local" && root.isThreadResolved === true
}

/** Local comments still open — the ones a review, sync or Claude should see. */
export function publishableLocalComments(all: Comment[]): Comment[] {
  return all.filter((c) => c.status === "local" && !isLocallyResolved(c, all))
}

/**
 * What the review preview lists: root comments that are local or already
 * pending on GitHub, minus anything resolved locally.
 */
export function reviewCandidates(all: Comment[]): Comment[] {
  return all.filter(
    (c) =>
      (c.status === "local" || c.status === "pending") &&
      !c.inReplyTo &&
      !isLocallyResolved(c, all),
  )
}
