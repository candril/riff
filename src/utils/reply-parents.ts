import type { Comment } from "../types"

const PENDING_ID = /^pending-(\d+)$/

/**
 * After Submit Review the submitted comments keep their local ids until a
 * fetch brings GitHub's copies, so a reply typed in between points at a
 * local id. When that parent gives way to its copy, the reply has to follow
 * it or it drops out of its thread. A reply whose parent stayed comes back
 * as the same object, so a caller can tell which ones moved.
 */
export function reparentReplies(kept: Comment[], dropped: Comment[], fetched: Comment[]): Comment[] {
  const fetchedIdByGithubId = new Map(fetched.filter((c) => c.githubId).map((c) => [c.githubId, c.id]))
  const copyIdByDroppedId = new Map<string, string>()
  for (const c of dropped) {
    const copyId = c.githubId ? fetchedIdByGithubId.get(c.githubId) : undefined
    if (copyId && copyId !== c.id) copyIdByDroppedId.set(c.id, copyId)
  }
  // A draft comment is never saved to disk, so a reply loaded from disk
  // finds no dropped parent; its `pending-<id>` still names the githubId.
  const copyIdOf = (parentId: string) =>
    copyIdByDroppedId.get(parentId) ?? fetchedIdByGithubId.get(Number(PENDING_ID.exec(parentId)?.[1]))
  return kept.map((c) => {
    const copyId = c.inReplyTo ? copyIdOf(c.inReplyTo) : undefined
    return copyId && copyId !== c.inReplyTo ? { ...c, inReplyTo: copyId } : c
  })
}
