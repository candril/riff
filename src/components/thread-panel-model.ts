import type { Comment, ReactionSummary } from "../types"
import type { InlineCommentOverlayMode } from "../state"
import type { EmojiPickerState, MentionPickerState } from "../features/inline-comment-overlay/composer-pickers-state"
import { colors, theme } from "../theme"
import { flashLabelCell } from "../vim-diff/flash-state"
import { extractCommentImages, type CommentImage } from "../utils/comment-images"
import { fitPicker, threadPanelPicker, type ThreadPanelPicker } from "./thread-panel-picker"
import { threadPanelHints, type Hint } from "./thread-panel-hints"
import { windowThreads, type WindowThread } from "./thread-panel-window"
import { displayAuthor } from "./display-author"

export type { Hint } from "./thread-panel-hints"
export type { ThreadPanelPicker } from "./thread-panel-picker"
export { visibleOverlayCommentIds } from "./thread-panel-window"
export { displayAuthor } from "./display-author"

export interface ThreadPanelInput {
  comments: Comment[]
  /** Scope shown in the header — the user's currently selected file,
   *  or null in all-files view (header reads "all files"). */
  scopeFilename: string | null
  /** Anchor file for compose/edit mode (where a new comment lands). */
  composeFilename: string
  /** Anchor line for compose/edit mode. Ignored in view mode. */
  line: number
  /** Composing a reply rather than a thread of its own (spec 081). */
  replyToThread: boolean
  /** GitHub has no anchor for this line: what is written is a note. */
  note: boolean
  mode: InlineCommentOverlayMode
  /** Local diffs have nowhere to publish to — hints must not promise it. */
  appMode: "local" | "pr"
  /** Currently highlighted comment index in the displayOrder list. */
  highlightedIndex: number
  /** Comment id being edited (edit mode). */
  editingId: string | null
  /** A draft left on the composer's anchor line, waiting to be resumed
   *  (spec 061). Empty when there is none. */
  draft: string
  /** True when the panel itself is the focused surface — drives the
   *  header text's colour so it visibly differs from "panel open but
   *  user is driving the diff". */
  focused: boolean
  /** Wider layout (Ctrl-e). */
  expanded: boolean
  /** The panel's columns, which the diff beside it gives up. */
  width: number
  /** Active @mention picker session (null when no `@<query>` trigger). */
  mentionPicker: MentionPickerState | null
  /** Active `:shortcode` session (spec 082). */
  emojiPicker: EmojiPickerState | null
  /** Full PR-participant pool — filtered against `mentionPicker.query`
   *  to produce the visible candidate list. Empty in local-diff mode. */
  mentionCandidates: readonly string[]
  /** Fragment currently being looked up on GitHub, or null when idle. */
  mentionSearchQuery: string | null
  /** Root comment ids the user has expanded (`za`/Enter). Resolved
   *  threads expand to show body + replies; outdated threads expand to
   *  reveal the stored diff hunk. */
  expandedThreadIds: ReadonlySet<string>
  /** Comments that arrived since the reader's last visit (spec 069). */
  unseenIds: ReadonlySet<string>
  /** The `/` filter over the panel's comments, and whether it is being typed. */
  filter: string
  filterInput: boolean
  /** The open-only toggle and how many threads it keeps out; null while it is off. */
  openOnly: { hidden: number } | null
  /** Flash labels by comment id, while `s` is labelling the panel (spec 066). */
  flashLabels: ReadonlyMap<string, string>
}

export interface ThreadPanelHeader {
  label: string
  /** The accepted `/` filter, shown beside the label; null when there is none. */
  filterText: string | null
  /** While `/` is open the header is the prompt, as it is in the tree. */
  filterInput: boolean
  /** Says the open-only toggle is on; it is cut before the count is. */
  note: string | null
  noteFg: string
  /** The count, or what the composer is doing; null while the prompt is open. */
  right: string | null
  labelFg: string
  rightFg: string
}

export interface ThreadHeaderModel {
  /** Only a collapsed thread is a navigable item, so only it has a caret. */
  caret: string | null
  caretFg: string
  divider: string
  author: string | null
  badge: { text: string; fg: string } | null
  /**
   * Drawn as a mark only: the original code an outdated thread was left
   * on is `c`, which draws the stored hunk over the panel (spec 060).
   */
  outdated: boolean
  unseen: boolean
  highlighted: boolean
}

export interface ThreadCommentModel {
  key: string
  caret: string
  caretFg: string
  indent: 0 | 2
  connector: string | null
  author: string
  time: string
  status: Comment["status"]
  statusFg: string
  edited: boolean
  editing: boolean
  highlighted: boolean
  bodyIndent: number
  bodyText: string
  images: CommentImage[]
  reactions: ReactionSummary[] | null
}

export interface ThreadModel {
  key: string
  header: ThreadHeaderModel
  /** Empty while the thread is collapsed. */
  comments: ThreadCommentModel[]
}

export interface ThreadPanelModel {
  header: ThreadPanelHeader
  /** How many threads lie past each edge of the window. */
  window: { before: number; after: number }
  threads: ThreadModel[]
  /** How many of the stack's rows each window thread takes, in order. */
  threadSizes: number[]
  empty: boolean
  emptyText: string
  composer: { mode: "compose" | "edit"; label: string } | null
  picker: ThreadPanelPicker
  /** Null while composing: the composer's keys would not fit the panel's width. */
  hints: Hint[] | null
}

/** `pickerRoom`: the rows above the composer as last laid out, or null before it was. */
export function threadPanelModel(
  input: ThreadPanelInput & { now: number },
  pickerRoom: number | null = null
): ThreadPanelModel {
  const { comments, mode } = input
  const { displayOrder, window } = windowThreads(
    comments,
    input.expandedThreadIds,
    input.highlightedIndex,
    input.expanded
  )
  const highlighted = displayOrder[input.highlightedIndex]
  const isComposing = mode === "compose" || mode === "edit"
  const threads = window.threads.map((thread) => threadModel(thread, input, highlighted?.id))

  return {
    header: {
      label: input.scopeFilename ? basename(input.scopeFilename) : "all files",
      filterText: input.filter ? input.filter : null,
      filterInput: input.filterInput,
      note: input.openOnly ? `open only · ${input.openOnly.hidden} hidden` : null,
      noteFg: colors.secondary,
      right: input.filterInput
        ? null
        : isComposing
          ? mode === "edit"
            ? "Editing"
            : "Composing"
          : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`,
      labelFg: input.focused ? colors.primary : colors.textMuted,
      rightFg: theme.overlay0,
    },
    window: { before: window.before, after: window.after },
    threads,
    threadSizes: threads.map((thread) => 1 + thread.comments.length),
    empty: comments.length === 0,
    // Hidden threads are still there; an empty panel that does not say so reads as a review without any.
    emptyText: input.openOnly && input.openOnly.hidden > 0
      ? "No open threads · H shows all"
      : "No comments in this file yet.",
    composer: isComposing
      ? { mode: mode === "edit" ? "edit" : "compose", label: composerLabel(input, highlighted) }
      : null,
    picker: isComposing ? fitPicker(threadPanelPicker(input), pickerRoom) : null,
    hints: isComposing ? null : threadPanelHints(input, highlighted),
  }
}

function threadModel(
  { thread, collapsed }: WindowThread,
  input: ThreadPanelInput & { now: number },
  highlightedId: string | undefined
): ThreadModel {
  const root = thread.comments[0]!
  const total = thread.comments.length
  const highlighted = collapsed && root.id === highlightedId
  const label = input.flashLabels.get(root.id)
  return {
    key: root.id,
    header: {
      caret: collapsed ? caretContent(label, highlighted) : null,
      caretFg: caretFg(label, highlighted),
      // Unscoped (all-files) threads from different files would otherwise
      // run together with no separator.
      divider: input.scopeFilename === null ? `─ ${basename(root.filename)}:${root.line}` : `─ line ${root.line}`,
      author: collapsed ? displayAuthor(root.author || "you") : null,
      badge: thread.resolved
        ? { text: total > 1 ? `✓ ${total}` : "✓", fg: theme.green }
        : collapsed
          ? { text: total > 1 ? `⋯ ${total}` : "⋯", fg: theme.overlay0 }
          : null,
      outdated: thread.outdated,
      unseen: thread.comments.some((comment) => input.unseenIds.has(comment.id)),
      highlighted,
    },
    comments: collapsed ? [] : thread.comments.map((comment, i) => commentModel(comment, i === 0, input, highlightedId)),
  }
}

function commentModel(
  comment: Comment,
  isRoot: boolean,
  input: ThreadPanelInput & { now: number },
  highlightedId: string | undefined
): ThreadCommentModel {
  const highlighted = comment.id === highlightedId
  const label = input.flashLabels.get(comment.id)
  const body = extractCommentImages(comment.localEdit ?? comment.body)
  return {
    key: comment.id,
    caret: caretContent(label, highlighted),
    caretFg: caretFg(label, highlighted),
    indent: isRoot ? 0 : 2,
    connector: isRoot ? null : "└ ",
    author: displayAuthor(comment.author || "you"),
    time: formatTimeAgo(comment.createdAt, input.now),
    status: comment.status,
    statusFg: getStatusColor(comment.status),
    edited: comment.localEdit !== undefined,
    editing: comment.id === input.editingId,
    highlighted,
    bodyIndent: isRoot ? 4 : 6,
    bodyText: body.text,
    images: body.images,
    reactions: comment.reactions !== undefined && comment.reactions.length > 0 ? comment.reactions : null,
  }
}

function composerLabel(input: ThreadPanelInput, highlighted: Comment | undefined): string {
  const { mode, note, replyToThread, line, composeFilename } = input
  const composeFile = basename(composeFilename)
  const onALineWithAThread =
    highlighted !== undefined && highlighted.line === line && highlighted.filename === composeFilename
  // A note says so before anything is typed. Finding out at publish time
  // that a comment can never be published is finding out too late.
  return mode === "edit"
    ? "Editing comment"
    : note
      ? `Note @ ${composeFile}:${line} — local only, never published`
      : replyToThread
        ? `Reply @ ${composeFile}:${line}`
        : onALineWithAThread
          ? `New thread @ ${composeFile}:${line}`
          : `New comment @ ${composeFile}:${line}`
}

export function getStatusColor(status: Comment["status"]): string {
  switch (status) {
    case "local":
      return colors.commentLocal
    case "pending":
      return colors.commentPending
    case "synced":
      return colors.commentSynced
    default:
      return colors.textDim
  }
}

export function formatTimeAgo(isoDate: string, now: number): string {
  const date = new Date(isoDate)
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

/** The row's two-cell lead: its flash label while labelling, else the caret. */
export function caretContent(label: string | undefined, highlighted: boolean): string {
  if (label !== undefined) return flashLabelCell(label)
  return highlighted ? "▸ " : "  "
}

function caretFg(label: string | undefined, highlighted: boolean): string {
  if (label !== undefined) return colors.flashLabel
  return highlighted ? theme.blue : theme.overlay0
}

function basename(path: string): string {
  return path.split("/").pop() || path
}
