/**
 * Build, filter, and sort entries for the comments picker (spec 044).
 *
 * Entries are derived live from `state.comments` so background syncs and
 * mutations flow through without a refresh step.
 */

import type { AppState } from "../../state"
import type { Comment } from "../../types"
import { fuzzyFilter } from "../../utils/fuzzy"
import { extractCommentImages } from "../../utils/comment-images"

export interface CommentsPickerEntry {
  comment: Comment
  /** One-line stand-in for the body, used in the row preview. */
  preview: string
  /** True if this comment has no parent (root of a thread). */
  isRoot: boolean
  /** Resolved status of the *thread* this comment belongs to. */
  threadResolved: boolean
}

/**
 * One line to stand for the whole comment. Images are lifted out first —
 * a pasted screenshot is a line of `<img>` attributes, which would fill the
 * preview with markup and hide whatever the author actually wrote.
 */
function preview(body: string): string {
  const { text, images } = extractCommentImages(body)
  const line = firstLine(text)
  if (line) return line
  return images.length > 0 ? `▣ ${images[0]!.label}` : ""
}

function firstLine(body: string): string {
  for (const raw of body.split("\n")) {
    const t = raw.trim()
    if (t.length > 0) return t
  }
  return ""
}

/**
 * Build entries for every comment in `state.comments`. Sort: filename,
 * then line, then root-before-replies, then createdAt (insertion order).
 */
export function buildEntries(state: AppState): CommentsPickerEntry[] {
  // Map root id -> resolved flag so replies inherit the thread state.
  const rootResolved = new Map<string, boolean>()
  for (const c of state.comments) {
    if (!c.inReplyTo) {
      rootResolved.set(c.id, c.isThreadResolved ?? false)
    }
  }

  const entries: CommentsPickerEntry[] = state.comments.map((c) => {
    const rootId = c.inReplyTo ?? c.id
    return {
      comment: c,
      preview: preview(c.body),
      isRoot: !c.inReplyTo,
      threadResolved: rootResolved.get(rootId) ?? false,
    }
  })

  entries.sort((a, b) => {
    const f = a.comment.filename.localeCompare(b.comment.filename)
    if (f !== 0) return f
    if (a.comment.line !== b.comment.line) return a.comment.line - b.comment.line
    // Roots before replies on the same line.
    if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1
    return a.comment.createdAt.localeCompare(b.comment.createdAt)
  })

  return entries
}

/**
 * Apply the picker query to a list of entries. Empty query returns the
 * input unchanged so the natural sort order is the displayed order.
 */
export function filterEntries(
  entries: CommentsPickerEntry[],
  query: string
): CommentsPickerEntry[] {
  if (!query) return entries
  return fuzzyFilter(query, entries, (e) => [
    e.comment.body,
    e.comment.filename,
    e.comment.author ?? "",
  ])
}

/** Convenience: build + filter in one call from `state`. */
export function getFilteredEntries(state: AppState): CommentsPickerEntry[] {
  return filterEntries(buildEntries(state), state.commentsPicker.query)
}
