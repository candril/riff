import { isLocallyResolved } from "../utils/publishable"
import type { Comment } from "../types"

export interface SyncItem {
  type: "edit" | "reply" | "new"
  comment: Comment
  /** For edits: the new body to send */
  newBody?: string
  /** For replies: the parent comment */
  parent?: Comment
}

/** What a sync would send to GitHub: edits to synced comments, replies to them, and new local comments. */
export function gatherSyncItems(comments: Comment[]): SyncItem[] {
  const items: SyncItem[] = []

  for (const comment of comments) {
    if (comment.status === "synced" && comment.localEdit && comment.githubId) {
      items.push({
        type: "edit",
        comment,
        newBody: comment.localEdit,
      })
    }

    // A thread resolved locally is closed business — nothing in it syncs.
    if (isLocallyResolved(comment, comments)) continue

    if (comment.status === "local" && comment.inReplyTo) {
      const parent = comments.find(c => c.id === comment.inReplyTo)
      if (parent?.githubId) {
        items.push({
          type: "reply",
          comment,
          parent,
        })
      }
    }

    if (comment.status === "local" && !comment.inReplyTo) {
      items.push({
        type: "new",
        comment,
      })
    }
  }

  return items
}
