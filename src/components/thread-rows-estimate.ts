import type { Comment } from "../types"

/** The thread panel host's side padding (`app/thread-panel.tsx`). */
export const PANEL_PADDING_X = 1
/** The threads' viewport's side padding (`ThreadPanelView.tsx`). */
export const VIEWPORT_PADDING_X = 2
/** Where a body starts within its comment row: a root's under its author, a reply's past its connector. */
export const ROOT_BODY_INDENT = 4
export const REPLY_INDENT = 2
export const REPLY_BODY_INDENT = 6

/** A collapsed thread draws only its header: the gap above it, its margin and its row. */
const COLLAPSED_THREAD_ROWS = 3

/**
 * What the window of threads is chosen by: the columns the comment stack is
 * laid out in, and the rows its viewport shows, 0 while they are unknown.
 */
export interface ThreadRowBudget {
  textWidth: number
  viewportRows: number
}

/** The columns of the panel's comment stack, inside the host's and the viewport's padding. */
export function threadTextWidth(panelWidth: number): number {
  return Math.max(1, panelWidth - 2 * PANEL_PADDING_X - 2 * VIEWPORT_PADDING_X)
}

/**
 * The rows the threads' viewport shows in a panel `panelRows` tall: less
 * the header, the key hints (not drawn while composing) and the viewport's
 * padding rows. The composer's own rows are left out; they only take rows
 * while a comment is being written.
 */
export function threadViewportRows(panelRows: number, composing: boolean): number {
  return Math.max(0, panelRows - 1 - (composing ? 0 : 1) - 2)
}

/**
 * A comment's rows as the panel draws it, guessed from its text where no
 * layout can be read: a gap and the author row, above a thread's first
 * comment its divider with the space around it, then each non-blank body
 * line wrapped to the body's columns. Fenced code is drawn unwrapped, so
 * each of its lines is one row; the rest of markdown is not modelled.
 */
export function estimatedCommentRows(comment: Comment, textWidth: number): number {
  const bodyWidth = Math.max(1, textWidth - (comment.inReplyTo ? REPLY_INDENT + REPLY_BODY_INDENT : ROOT_BODY_INDENT))
  let rows = 0
  let fenced = false
  for (const line of (comment.localEdit ?? comment.body).split("\n")) {
    const fence = /^\s*(```|~~~)/.test(line)
    if (line.trim() !== "") rows += fenced || fence ? 1 : Math.ceil(Bun.stringWidth(line) / bodyWidth)
    if (fence) fenced = !fenced
  }
  return (comment.inReplyTo ? 2 : 5) + Math.max(1, rows)
}

/** A thread's rows: only its header while collapsed, every comment while expanded. */
export function estimatedThreadRows(comments: readonly Comment[], collapsed: boolean, textWidth: number): number {
  if (collapsed) return COLLAPSED_THREAD_ROWS
  return comments.reduce((rows, comment) => rows + estimatedCommentRows(comment, textWidth), 0)
}
