import { theme } from "../theme"
import { extractCommentImages } from "../utils/comment-images"
import type { ReactionSummary } from "../types"
import {
  bodyPreviewWidth,
  hunkLines,
  inlineReactions,
  reactionPills,
  threadBodyPreviewWidth,
  threadFileLineWidth,
  type Segment,
} from "./pr-info-conversation-parts"
import type { ReviewThread, ReviewWithThreads } from "./pr-info-conversation"
import { TIME_COLUMN_WIDTH, cleanBodyPreview, formatTimeAgo, getReviewIcon, threadActivityAt, truncate } from "./pr-info-format"
import { flatConversationItemId, type FlatConversationItem } from "./pr-info-items"
import type { PrConversationComment } from "../providers/github"

/**
 * A cell of a one-line row. `fixed` keeps its width (flexShrink 0), `grow`
 * takes what the fixed cells leave and gives it back first, and a cell with
 * neither keeps the layout's defaults.
 */
export interface HeaderSegment extends Segment {
  flex?: "fixed" | "grow"
}

/**
 * What an expanded item opens onto, in order, each part indented as drawn.
 * `key` is unique within the row, so a push matches a part to the one it
 * drew before rather than to whatever sits at its position, and a markdown
 * body whose text did not change is never laid out again.
 */
export type BodyPart =
  | { kind: "hunk"; key: string; indent: number; lines: Segment[] }
  /** The pictures the body carried are named under it, in the same padded box. */
  | { kind: "markdown"; key: string; id: string; text: string; images: string[]; indent: number }
  | { kind: "reactions"; key: string; indent: number; pills: Segment[] }
  | { kind: "reply"; key: string; indent: number; author: string; time: string }

interface RowBase {
  /** Stable across a cursor move or a rebuild, as each item's own id. */
  key: string
  selected: boolean
  label?: string
}

export type ConversationRow =
  | (RowBase & { kind: "item"; indent: number; header: HeaderSegment[]; body: BodyPart[] })
  | (RowBase & { kind: "reviewers"; header: HeaderSegment[]; names: Segment[]; namesIndent: number })

export interface ConversationRows {
  rows: ConversationRow[]
  /** The muted line drawn when there is nothing to list. */
  note: string | null
}

export interface ConversationInput {
  /** The cursor's item, or -1 when the cursor is elsewhere. */
  selected: number
  /** The panel's flash labels, keyed `conversation:${index}`. */
  labels: ReadonlyMap<string, string>
  expanded: ReadonlySet<string>
  terminalWidth: number
  /** The loaded diff around a line, for a thread GitHub sent without a hunk. */
  diffContext: (filename: string, line: number) => string | null
  now?: number
}

const REVIEWER_INDENT = 4
const REVIEWER_GUTTER = 4

/** One entry per flat item, in order: what its row says and what it opens onto. */
export function conversationRows(items: FlatConversationItem[], input: ConversationInput): ConversationRows {
  if (items.length === 0) return { rows: [], note: "No comments" }

  const rows = items.map((item, index): ConversationRow => {
    const selected = index === input.selected
    const label = input.labels.get(`conversation:${index}`)
    const base: RowBase = { key: flatConversationItemId(item), selected, ...(label ? { label } : {}) }
    switch (item.type) {
      case "pr-comment":
        return { ...base, kind: "item", indent: 0, ...commentRow(item.data, selected, input, base.key) }
      case "review-header":
        return { ...base, kind: "item", indent: 0, ...reviewRow(item.data, selected, input, base.key) }
      case "review-thread":
        return { ...base, kind: "item", indent: 2, ...threadRow(item.data, selected, input, base.key) }
      case "pending-reviewer":
        return { ...base, kind: "reviewers", ...reviewersRow(item.data, selected, input.terminalWidth) }
    }
  })
  return { rows, note: null }
}

type ItemParts = { header: HeaderSegment[]; body: BodyPart[] }

const fixed = (text: string, fg: string): HeaderSegment => ({ text, fg, flex: "fixed" })
const grow = (text: string, fg: string): HeaderSegment => ({ text, fg, flex: "grow" })

const author = (name: string, selected: boolean) => fixed(`@${name}`, selected ? theme.blue : theme.sapphire)
const expandIcon = (expanded: boolean) => fixed(`${expanded ? "▼" : "▶"} `, theme.subtext0)

function timeColumn(isoDate: string, now: number | undefined): string {
  return `  ${formatTimeAgo(isoDate, now).padStart(TIME_COLUMN_WIDTH)}`
}

function trailing(reactions: ReactionSummary[] | undefined, isoDate: string | undefined, now?: number): HeaderSegment[] {
  const summary = inlineReactions(reactions)
  return [
    ...(summary ? [fixed(`  ${summary}`, theme.overlay1)] : []),
    ...(isoDate ? [fixed(timeColumn(isoDate, now), theme.overlay0)] : []),
  ]
}

function markdown(id: string, body: string, indent: number): BodyPart {
  const parsed = extractCommentImages(body)
  return { kind: "markdown", key: id, id, text: parsed.text, images: parsed.images.map((image) => image.label), indent }
}

function reactions(key: string, summary: ReactionSummary[] | undefined, indent: number): BodyPart[] {
  const pills = reactionPills(summary)
  return pills.length > 0 ? [{ kind: "reactions", key, indent, pills }] : []
}

function commentRow(comment: PrConversationComment, selected: boolean, input: ConversationInput, rowKey: string): ItemParts {
  const expanded = input.expanded.has(String(comment.id))
  const bot = comment.isBot
  const header = [
    expandIcon(expanded),
    fixed("PR ", theme.overlay1),
    bot ? fixed(`@${comment.author}`, theme.overlay0) : author(comment.author, selected),
    expanded
      ? grow("", theme.subtext1)
      : grow(
          `  ${truncate(cleanBodyPreview(comment.body), bodyPreviewWidth(input.terminalWidth))}`,
          bot ? theme.overlay0 : selected ? theme.text : theme.subtext1
        ),
    ...trailing(comment.reactions, comment.createdAt, input.now),
  ]
  const body = expanded
    ? [markdown(`pr-comment-${comment.id}`, comment.body, 4), ...reactions(`${rowKey}:reactions`, comment.reactions, 4)]
    : []
  return { header, body }
}

function stateLabel(state: ReviewWithThreads["state"]): string {
  if (state === "CHANGES_REQUESTED") return "requested changes"
  if (state === "APPROVED") return "approved"
  return "commented"
}

function reviewRow(review: ReviewWithThreads, selected: boolean, input: ConversationInput, rowKey: string): ItemParts {
  const expanded = input.expanded.has(review.id)
  const threads = review.threads.length
  const { icon, color } = getReviewIcon(review.state)
  const header = [
    expandIcon(expanded),
    fixed(`${icon}  `, color),
    author(review.author, selected),
    fixed(`  ${stateLabel(review.state)}`, theme.subtext0),
    !expanded && threads > 0
      ? grow(`  (${threads} ${threads === 1 ? "thread" : "threads"})`, theme.overlay0)
      : grow("", theme.subtext1),
    ...trailing(review.reactions, review.submittedAt, input.now),
  ]
  const body: BodyPart[] = []
  if (expanded && review.body?.trim()) body.push(markdown(`review-${review.id}`, review.body, 4))
  if (expanded) body.push(...reactions(`${rowKey}:reactions`, review.reactions, 4))
  return { header, body }
}

function threadRow(thread: ReviewThread, selected: boolean, input: ConversationInput, rowKey: string): ItemParts {
  const expanded = input.expanded.has(thread.id)
  const icon = thread.isResolved ? "✓" : expanded ? "▼" : "▶"
  // Five cells of the column stay free for ":line".
  const file = truncate(thread.filename.split("/").pop() || thread.filename, threadFileLineWidth(input.terminalWidth) - 5)
  const header = [
    fixed(`${icon} `, thread.isResolved ? theme.green : theme.subtext0),
    fixed(` ${file}:${thread.line}  `, theme.yellow),
    author(thread.author, selected),
    expanded
      ? grow("", theme.subtext1)
      : grow(
          `  ${truncate(cleanBodyPreview(thread.body), threadBodyPreviewWidth(input.terminalWidth))}`,
          selected ? theme.text : theme.subtext1
        ),
    ...(thread.replies.length > 0 && !expanded ? [fixed(`  (${thread.replies.length + 1})`, theme.overlay0)] : []),
    ...trailing(thread.reactions, threadActivityAt(thread), input.now),
  ]
  return { header, body: expanded ? threadBody(thread, input, rowKey) : [] }
}

function threadBody(thread: ReviewThread, input: ConversationInput, rowKey: string): BodyPart[] {
  const hunk = thread.diffHunk?.trim() ? thread.diffHunk : input.diffContext(thread.filename, thread.line)
  const body: BodyPart[] = hunk ? [{ kind: "hunk", key: `${rowKey}:hunk`, indent: 6, lines: hunkLines(hunk) }] : []
  body.push(markdown(`thread-${thread.id}`, thread.body, 6), ...reactions(`${rowKey}:reactions`, thread.reactions, 6))
  thread.replies.forEach((reply, n) => {
    const replyKey = `${rowKey}:reply:${n}`
    body.push(
      { kind: "reply", key: replyKey, indent: 6, author: reply.author ?? "you", time: timeColumn(reply.createdAt, input.now) },
      markdown(`reply-${reply.id}`, reply.body, 8),
      ...reactions(`${replyKey}:reactions`, reply.reactions, 8)
    )
  })
  return body
}

/**
 * One cursor stop for everyone still asked to review: a header, then the
 * names packed onto as many rows as the terminal needs, rather than one
 * "awaiting review" row each.
 */
function reviewersRow(reviewers: string[], selected: boolean, terminalWidth: number) {
  const header = [fixed("○ ", theme.yellow), fixed(`awaiting review (${reviewers.length})`, theme.yellow)]
  const fg = selected ? theme.blue : theme.sapphire
  return {
    header,
    names: packNames(reviewers, terminalWidth).map((text) => ({ text, fg })),
    namesIndent: REVIEWER_INDENT,
  }
}

/** `@name`s joined two spaces apart, wrapped to the terminal less an indent and a gutter. */
export function packNames(names: string[], terminalWidth: number): string[] {
  const available = Math.max(20, terminalWidth - REVIEWER_INDENT - REVIEWER_GUTTER)
  const chunks: string[][] = []
  let current: string[] = []
  let width = 0
  for (const name of names) {
    const piece = `@${name}`
    const pieceWidth = piece.length + 2
    if (current.length > 0 && width + pieceWidth > available) {
      chunks.push(current)
      current = []
      width = 0
    }
    current.push(piece)
    width += pieceWidth
  }
  if (current.length > 0) chunks.push(current)
  return chunks.map((chunk) => chunk.join("  "))
}
