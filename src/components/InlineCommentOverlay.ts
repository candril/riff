/**
 * InlineCommentOverlay — actionable thread overlay (spec 039).
 *
 * Replaces the read-only `ThreadPreview` modal that used to sit on
 * `Enter`. The overlay is the single surface where every comment action
 * happens: read, reply (inline), edit (inline), delete, resolve, react,
 * submit. It opens with `Enter` on a commented line (view mode) or `c`
 * on any diff line (compose mode).
 *
 * Rendering only — keystrokes live in
 * `src/features/inline-comment-overlay/input.ts`.
 */

import { Box, Text, MarkdownRenderable, SyntaxStyle, RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme, colors } from "../theme"
import type { Comment } from "../types"
import type { InlineCommentOverlayMode } from "../state"
import { groupIntoThreads } from "../utils/threads"
import { ReactionRow } from "./ReactionRow"
import { CommentComposer } from "./CommentComposer"

export interface InlineCommentOverlayProps {
  comments: Comment[]
  filename: string
  line: number
  /** Drives panel layout — view shows hints; compose/edit show composer. */
  mode: InlineCommentOverlayMode
  /** Currently highlighted comment index. Targets actions and the
   *  palette React… submenu (spec 042). */
  highlightedIndex: number
  /** Comment id being edited (edit mode) */
  editingId: string | null
  renderer: CliRenderer
}

/**
 * Cache of MarkdownRenderable instances by comment id. Reusing the same
 * instance across renders avoids re-parsing markdown / re-tokenizing
 * code blocks on every keystroke, which was the cause of the visible
 * flicker on threads with multiple comments. Entries are kept for the
 * lifetime of the process — comments rarely number in the thousands and
 * rebuild on app restart, so a leak here is academic.
 */
const markdownCache = new Map<string, MarkdownRenderable>()

function getCachedMarkdown(
  renderer: CliRenderer,
  id: string,
  content: string
): MarkdownRenderable {
  let inst = markdownCache.get(id)
  if (!inst) {
    inst = new MarkdownRenderable(renderer, {
      id,
      content,
      syntaxStyle: getSyntaxStyle(),
    })
    markdownCache.set(id, inst)
  } else if (inst.content !== content) {
    inst.content = content
  }
  return inst
}

/**
 * Side-panel width. Picked so the panel is comfortable for prose (long
 * enough to fit a typical comment line) without crowding the diff. The
 * panel caps at half the terminal so very narrow terminals still show
 * some diff to the left of it.
 */
const PANEL_WIDTH_TARGET = 72
const PANEL_WIDTH_MIN = 48

function getPanelWidth(): number {
  const cols = process.stdout.columns || 120
  const half = Math.floor(cols / 2)
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_TARGET, half))
}

let sharedSyntaxStyle: SyntaxStyle | null = null
function getSyntaxStyle(): SyntaxStyle {
  if (!sharedSyntaxStyle) {
    sharedSyntaxStyle = SyntaxStyle.fromStyles({
      "markup.heading": { fg: RGBA.fromHex(theme.blue), bold: true },
      "markup.strong": { bold: true },
      "markup.italic": { italic: true },
      "markup.raw": { fg: RGBA.fromHex(theme.green) },
      "markup.strikethrough": { dim: true },
      "markup.link": { fg: RGBA.fromHex(theme.blue) },
      "markup.link.label": { fg: RGBA.fromHex(theme.blue), underline: true },
      "markup.link.url": { fg: RGBA.fromHex(theme.subtext0) },
      "markup.list": { fg: RGBA.fromHex(theme.yellow) },
      "punctuation.special": { fg: RGBA.fromHex(theme.subtext0), italic: true },
      "keyword": { fg: RGBA.fromHex(theme.mauve) },
      "string": { fg: RGBA.fromHex(theme.green) },
      "number": { fg: RGBA.fromHex(theme.peach) },
      "comment": { fg: RGBA.fromHex(theme.overlay0), italic: true },
      "function": { fg: RGBA.fromHex(theme.blue) },
      "type": { fg: RGBA.fromHex(theme.yellow) },
      "variable": { fg: RGBA.fromHex(theme.text) },
      "operator": { fg: RGBA.fromHex(theme.sky) },
      "punctuation": { fg: RGBA.fromHex(theme.overlay2) },
      "property": { fg: RGBA.fromHex(theme.lavender) },
      "constant": { fg: RGBA.fromHex(theme.peach) },
    })
  }
  return sharedSyntaxStyle
}

function getStatusColor(status: Comment["status"]): string {
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

function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
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

/** Ordered list of (key, label) pairs rendered in the footer hint row.
 *  Mirrors the PRInfoPanel pattern (yellow key glyph + subtext0 label). */
type Hint = readonly [string, string]

function viewModeHints(canSubmit: boolean, hasComments: boolean): Hint[] {
  if (!hasComments) {
    return [
      ["r", "new"],
      ["c/Esc", "close"],
    ]
  }
  const hints: Hint[] = [
    ["j/k", "nav"],
    ["J/K", "thread"],
    ["r", "reply"],
    ["e", "edit"],
    ["d", "del"],
    ["x", "resolve"],
  ]
  if (canSubmit) hints.push(["S", "submit"])
  hints.push(["c/Esc", "close"])
  return hints
}

/**
 * Render a footer-style hint row. Each pair lives in its own Box with a
 * `marginRight` so spacing is layout-driven instead of leaning on
 * trailing whitespace inside Text nodes (which OpenTUI's flex row
 * collapses unreliably between adjacent Text children).
 */
function renderHintRow(hints: Hint[]) {
  return Box(
    { flexDirection: "row" },
    ...hints.map(([key, label], i) =>
      Box(
        {
          flexDirection: "row",
          marginRight: i === hints.length - 1 ? 0 : 2,
        },
        Text({ content: key, fg: theme.yellow }),
        Text({ content: " ", fg: theme.subtext0 }),
        Text({ content: label, fg: theme.subtext0 })
      )
    )
  )
}

export function InlineCommentOverlay({
  comments,
  filename,
  line,
  mode,
  highlightedIndex,
  editingId,
  renderer,
}: InlineCommentOverlayProps) {
  const threads = groupIntoThreads(comments)
  const shortFilename = filename.split("/").pop() || filename
  const displayOrder: Comment[] = threads.flatMap((t) => t.comments)
  const highlightedId = displayOrder[highlightedIndex]?.id
  const highlightedComment = comments[highlightedIndex]
  const canSubmit = highlightedComment
    ? highlightedComment.status === "local" || highlightedComment.localEdit !== undefined
    : false
  const isComposing = mode === "compose" || mode === "edit"
  const composerLabel =
    mode === "edit"
      ? "Editing comment"
      : comments.length > 0
        ? "Reply"
        : "New comment"

  const panelWidth = getPanelWidth()

  // Right-anchored side panel. Sits over the diff without dimming it so
  // the cursor line stays in view while the user reads/replies. A left
  // border line separates it visually from the diff content underneath.
  return Box(
    {
      position: "absolute",
      top: 0,
      right: 0,
      width: panelWidth,
      height: "100%",
      zIndex: 50,
      flexDirection: "row",
    },
    // Left edge separator
    Box({
      width: 1,
      height: "100%",
      backgroundColor: theme.surface0,
    }),
    Box(
      {
        flexGrow: 1,
        flexDirection: "column",
        backgroundColor: theme.base,
        height: "100%",
        overflow: "hidden",
      },
      // Header — left: anchor; right: mode label OR comment count
      // (in view mode the count is more useful than the static "Thread"
      // word and saves a row at the bottom).
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        Text({ content: `${shortFilename}:${line}`, fg: theme.text }),
        Text({
          content: isComposing
            ? mode === "edit"
              ? "Editing"
              : "Composing"
            : comments.length > 0
              ? `${comments.length} comment${comments.length !== 1 ? "s" : ""}`
              : "New comment",
          fg: theme.overlay0,
        })
      ),

      // Thread comments (or empty-state hint)
      comments.length > 0
        ? Box(
            {
              flexDirection: "column",
              paddingX: 2,
              paddingY: 1,
              gap: 1,
            },
            ...threads.flatMap((thread) =>
              thread.comments.map((comment, i) => {
                const isRoot = i === 0
                const author = comment.author || "you"
                const statusColor = getStatusColor(comment.status)
                const connector = isRoot ? "" : "\u2514 "
                const isHighlighted = comment.id === highlightedId
                const isBeingEdited = comment.id === editingId

                return Box(
                  {
                    flexDirection: "row",
                    paddingLeft: isRoot ? 0 : 2,
                    backgroundColor: isHighlighted ? theme.surface0 : undefined,
                  },
                  // Highlight gutter
                  Text({
                    content: isHighlighted ? "▸ " : "  ",
                    fg: isHighlighted ? theme.blue : theme.overlay0,
                  }),
                  Box(
                    { flexDirection: "column", flexGrow: 1 },
                    // Header row: connector + author + time + status
                    Box(
                      { flexDirection: "row" },
                      !isRoot
                        ? Text({ content: connector, fg: colors.textDim })
                        : null,
                      Text({ content: `@${author}`, fg: theme.blue }),
                      Text({ content: ` ${formatTimeAgo(comment.createdAt)}`, fg: theme.overlay0 }),
                      Text({ content: ` [${comment.status}]`, fg: statusColor }),
                      comment.localEdit !== undefined
                        ? Text({ content: " *edited", fg: colors.commentPending })
                        : null,
                      isBeingEdited
                        ? Text({ content: " (editing)", fg: theme.yellow })
                        : null,
                      isRoot && thread.resolved
                        ? Text({ content: " \u2713", fg: theme.green })
                        : null
                    ),
                    // Body (markdown rendered). When a comment is being
                    // edited inline we still render the original body so
                    // the user sees what they're changing — the draft is
                    // shown in the composer below.
                    Box(
                      { paddingLeft: isRoot ? 2 : 4 },
                      getCachedMarkdown(
                        renderer,
                        `inline-overlay-body-${comment.id}`,
                        comment.localEdit ?? comment.body
                      )
                    ),
                    // Reactions row (spec 042). Hidden when empty.
                    Box(
                      { paddingLeft: isRoot ? 2 : 4 },
                      ReactionRow({ reactions: comment.reactions })
                    )
                  )
                )
              })
            )
          )
        : Box(
            { flexDirection: "column", paddingX: 2, paddingY: 1 },
            Text({
              content: "No comments here yet. Press c to start a new comment.",
              fg: theme.overlay0,
            })
          ),

      // Inline composer (compose / edit modes)
      isComposing
        ? Box(
            { flexDirection: "column", paddingX: 2, paddingY: 1 },
            CommentComposer({
              mode: mode === "edit" ? "edit" : "compose",
              label: composerLabel,
              renderer,
            })
          )
        : null,

      // Footer — action hints (PR-info-panel style: yellow key, muted label).
      Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        isComposing
          ? renderHintRow([
              ["Ctrl-s", "save"],
              ["Ctrl-j", "newline"],
              ["Esc", "cancel"],
            ])
          : renderHintRow(viewModeHints(canSubmit, comments.length > 0))
      )
    )
  )
}
