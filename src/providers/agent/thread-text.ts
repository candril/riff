import type { Comment } from "../../types"
import type { Thread } from "../../utils/threads"

export const textOf = (comment: Comment) => comment.localEdit ?? comment.body

// GitHub hands a comment on a whole file over with line 0 or none at all.
export function placeOf(comment: Comment): string {
  if (!(comment.line > 0)) return `${comment.filename} (file)`
  const lines = comment.startLine ? `${comment.startLine}-${comment.line}` : String(comment.line)
  return `${comment.filename}:${lines}${comment.side === "LEFT" ? " (old)" : ""}`
}

export function stateOf(thread: Thread): string {
  return `${thread.resolved ? "resolved" : "open"}${thread.outdated ? ", outdated" : ""}`
}

// What sets a comment apart from GitHub's copy of it, if anything.
export function unsyncedOf(comment: Comment): string | null {
  const kind = comment.kind === "note" ? "note, " : ""
  if (comment.status !== "synced") return `${kind}${comment.status}`
  return comment.localEdit !== undefined ? `${kind}edited, not yet on GitHub` : null
}

/** The reviewer's own comments the agent may see and reword: those list_comments lists. */
export const isUnsynced = (comment: Comment) => unsyncedOf(comment) !== null

export function threadText(thread: Thread): string[] {
  const root = thread.comments[0]!
  const lines = [`Thread ${thread.id} on ${placeOf(root)} (${stateOf(thread)})`]
  for (const comment of thread.comments) {
    const unsynced = unsyncedOf(comment)
    const status = unsynced ? `, ${unsynced}` : ""
    lines.push(`--- ${comment.author ?? "you"}, ${comment.createdAt.slice(0, 10)}${status}`)
    lines.push(...textOf(comment).split("\n"))
  }
  return lines
}
