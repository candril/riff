import { colors, theme } from "../theme"
import type { Comment } from "../types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import { sideOf } from "./line-spans"
import type { Side } from "./rows"

export interface CommentSign {
  color: string
  side: Side
}

type SignedComment = Pick<Comment, "isThreadResolved" | "status" | "localEdit">

export function commentSignColor(comment: SignedComment): string {
  if (comment.isThreadResolved) return colors.commentResolved
  // Synced, but with an edit that has not gone up yet.
  if (comment.status === "synced" && comment.localEdit !== undefined) return theme.yellow
  if (comment.status === "synced") return theme.green
  if (comment.status === "pending") return theme.yellow
  return theme.blue
}

/**
 * The sign each commented line carries, keyed by the mapping's line. A
 * context line is in both halves, so the comment's own side picks one; a
 * line drawn in one half only can carry its sign nowhere else.
 */
export function commentSigns(mapping: DiffLineMapping, comments: readonly Comment[]): Map<number, CommentSign> {
  const signs = new Map<number, CommentSign>()
  for (const comment of comments) {
    const line = mapping.findLineForComment(comment)
    if (line === null) continue
    const own = sideOf(mapping.allLines, line)
    const side: Side =
      mapping.getLine(line)?.type === "context" || own === undefined
        ? comment.side === "LEFT" ? "left" : "right"
        : own === "old" ? "left" : "right"
    signs.set(line, { color: commentSignColor(comment), side })
  }
  return signs
}
