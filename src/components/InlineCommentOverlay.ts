/**
 * InlineCommentOverlay — file-scoped comments side panel (spec 039).
 *
 * Right-anchored side panel that lists every comment in the panel's
 * current file, grouped into threads. Single surface for read / reply /
 * edit / delete / resolve / submit / react.
 *
 * Toggled with `Ctrl-t` from the diff (mirrors `Ctrl-b` for the file
 * tree on the opposite side). Focusable like the file tree: `Ctrl-l`
 * enters from the diff, `Ctrl-h` exits, `Ctrl-e` widens it.
 *
 * Rendering only — keystrokes live in
 * `src/features/inline-comment-overlay/input.ts`.
 */

import { Box, Text, MarkdownRenderable, SyntaxStyle, RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme, colors } from "../theme"
import type { Comment } from "../types"
import type { InlineCommentOverlayMode, MentionPickerState } from "../state"
import { groupIntoThreads, type Thread } from "../utils/threads"
import { fuzzyFilter } from "../utils/fuzzy"
import { ReactionRow } from "./ReactionRow"
import { CommentComposer } from "./CommentComposer"

const MENTION_VISIBLE_LIMIT = 6

export function getFilteredMentionCandidates(
  candidates: readonly string[],
  query: string
): string[] {
  return fuzzyFilter(query, [...candidates], (c) => c).slice(0, MENTION_VISIBLE_LIMIT)
}

export interface InlineCommentOverlayProps {
  comments: Comment[]
  /** Scope shown in the header — the user's currently selected file,
   *  or null in all-files view (header reads "all files"). */
  scopeFilename: string | null
  /** Anchor file for compose/edit mode (where a new comment lands). */
  composeFilename: string
  /** Anchor line for compose/edit mode. Ignored in view mode. */
  line: number
  mode: InlineCommentOverlayMode
  /** Currently highlighted comment index in the displayOrder list. */
  highlightedIndex: number
  /** Comment id being edited (edit mode). */
  editingId: string | null
  /** True when the panel itself is the focused surface — drives
   *  border color so it visibly differs from "panel open but
   *  user is driving the diff". */
  focused: boolean
  /** Wider layout (Ctrl-e). */
  expanded: boolean
  /** Active @mention picker session (null when no `@<query>` trigger). */
  mentionPicker: MentionPickerState | null
  /** Full PR-participant pool — filtered against `mentionPicker.query`
   *  to produce the visible candidate list. Empty in local-diff mode. */
  mentionCandidates: readonly string[]
  /** Root comment ids the user has expanded (`za`/Enter). Resolved
   *  threads expand to show body + replies; outdated threads expand to
   *  reveal the stored diff hunk. */
  expandedThreadIds: ReadonlySet<string>
  renderer: CliRenderer
}

/**
 * Build a MarkdownRenderable for a comment body. We tried caching by
 * id to avoid re-parsing on every render, but reusing the same
 * Renderable instance across renders smeared its position (the body
 * text bled into adjacent comment headers — see CleanShot 2026-04-27
 * 17.38). OpenTUI's reconciliation expects fresh instances per render
 * tied to a stable `id`, so we instantiate every frame and rely on
 * the id-keyed reconciliation to be cheap enough.
 */
function buildMarkdown(
  renderer: CliRenderer,
  id: string,
  content: string
): MarkdownRenderable {
  return new MarkdownRenderable(renderer, {
    id,
    content,
    syntaxStyle: getSyntaxStyle(),
  })
}

/**
 * Side-panel widths. The narrow target keeps the diff readable on
 * normal terminals; the expanded target (Ctrl-e) gives prose room when
 * the user is actively reading / writing comments. Both cap at half
 * the terminal width so very narrow terminals still show some diff.
 */
const PANEL_WIDTH_TARGET = 64
const PANEL_WIDTH_EXPANDED = 96
const PANEL_WIDTH_MIN = 48

function getPanelWidth(expanded: boolean): number {
  const cols = process.stdout.columns || 120
  const target = expanded ? PANEL_WIDTH_EXPANDED : PANEL_WIDTH_TARGET
  const cap = Math.floor(cols * (expanded ? 0.7 : 0.5))
  return Math.max(PANEL_WIDTH_MIN, Math.min(target, cap))
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

type Hint = readonly [string, string]

function viewModeHints(canSubmit: boolean, hasComments: boolean, focused: boolean): Hint[] {
  if (!focused) {
    return [["Ctrl-l", "focus"], ["Ctrl-t", "close"]]
  }
  const hints: Hint[] = [["n", "new"]]
  if (hasComments) {
    hints.push(["j/k", "nav"], ["za", "expand"], ["r", "reply"], ["e", "edit"], ["d", "del"], ["x", "resolve"], ["o", "open"])
    if (canSubmit) hints.push(["S", "submit"])
  }
  hints.push(["Ctrl-h", "diff"], ["Ctrl-e", "expand"], ["Ctrl-t/Esc", "close"])
  return hints
}

function renderHintRow(hints: Hint[]) {
  // PRInfoPanel pattern: rows must declare `height: 1` or OpenTUI's
  // column flex won't measure Text height, and the parent stacks
  // siblings on top of each other (or wraps Text columns weirdly).
  const children = []
  for (let i = 0; i < hints.length; i++) {
    const [key, label] = hints[i]!
    children.push(Text({ content: key, fg: theme.yellow }))
    children.push(Text({
      content: i === hints.length - 1 ? ` ${label}` : ` ${label}  `,
      fg: theme.subtext0,
    }))
  }
  return Box({ flexDirection: "row", height: 1 }, ...children)
}

/**
 * Decide how many threads to render around the highlighted comment.
 * We render a fixed window so very long files don't dump every comment
 * into the layout — the side panel itself clips the rest. We always
 * include enough leading threads that the highlighted one ends up in
 * roughly the middle.
 */
function pickVisibleThreads(
  threads: Thread[],
  displayOrder: Comment[],
  highlightedIndex: number,
  windowSize: number
): { threads: Thread[]; before: number; after: number } {
  if (threads.length <= windowSize) {
    return { threads, before: 0, after: 0 }
  }
  const highlightedId = displayOrder[highlightedIndex]?.id
  const highlightedThreadIdx = highlightedId
    ? threads.findIndex((t) => t.comments.some((c) => c.id === highlightedId))
    : 0
  const half = Math.floor(windowSize / 2)
  const start = Math.max(0, Math.min(threads.length - windowSize, highlightedThreadIdx - half))
  const end = Math.min(threads.length, start + windowSize)
  return {
    threads: threads.slice(start, end),
    before: start,
    after: threads.length - end,
  }
}

function renderMentionPicker(
  picker: MentionPickerState,
  candidates: readonly string[]
) {
  const filtered = getFilteredMentionCandidates(candidates, picker.query)
  if (filtered.length === 0) {
    return Box(
      {
        flexDirection: "column",
        marginTop: 1,
        paddingX: 1,
        paddingY: 0,
        backgroundColor: theme.surface0,
        borderStyle: "single",
        borderColor: theme.overlay0,
      },
      Text({
        content: picker.query
          ? `No match for @${picker.query}`
          : "No participants to mention",
        fg: theme.overlay0,
      })
    )
  }
  // Clamp the highlight in case the candidate list shrank since the
  // last keystroke (e.g. user deleted a character that broadened the
  // match set, then typed one that narrowed it again).
  const selected = Math.min(picker.selectedIndex, filtered.length - 1)
  return Box(
    {
      flexDirection: "column",
      marginTop: 1,
      paddingX: 1,
      paddingY: 0,
      backgroundColor: theme.surface0,
      borderStyle: "single",
      borderColor: theme.blue,
    },
    Box(
      { flexDirection: "row", height: 1 },
      Text({ content: "@mention", fg: theme.blue })
    ),
    ...filtered.map((name, i) =>
      Box(
        {
          flexDirection: "row",
          height: 1,
          backgroundColor: i === selected ? theme.surface1 : undefined,
        },
        Text({
          content: i === selected ? "▸ " : "  ",
          fg: i === selected ? theme.blue : theme.overlay0,
        }),
        Text({ content: `@${name}`, fg: theme.text })
      )
    ),
    Box(
      { flexDirection: "row", height: 1 },
      Text({ content: "↑↓ nav  ", fg: theme.overlay0 }),
      Text({ content: "Tab/⏎ accept  ", fg: theme.overlay0 }),
      Text({ content: "Esc dismiss", fg: theme.overlay0 })
    )
  )
}

export function InlineCommentOverlay({
  comments,
  scopeFilename,
  composeFilename,
  line,
  mode,
  highlightedIndex,
  editingId,
  focused,
  expanded,
  mentionPicker,
  mentionCandidates,
  expandedThreadIds,
  renderer,
}: InlineCommentOverlayProps) {
  const threads = groupIntoThreads(comments)
  const headerLabel = scopeFilename
    ? scopeFilename.split("/").pop() || scopeFilename
    : "all files"
  // Resolved threads collapse to root only — keeps the panel scannable
  // when long-since-resolved discussions accumulate. Must mirror
  // `getInlineCommentOverlayDisplayOrder` so j/k indices align.
  const displayOrder: Comment[] = threads.flatMap((t) =>
    t.resolved ? [t.comments[0]!] : t.comments
  )
  const highlightedId = displayOrder[highlightedIndex]?.id
  const highlightedComment = displayOrder[highlightedIndex]
  const canSubmit = highlightedComment
    ? highlightedComment.status === "local" || highlightedComment.localEdit !== undefined
    : false
  const isComposing = mode === "compose" || mode === "edit"
  const composeFile = composeFilename.split("/").pop() || composeFilename
  const composerLabel =
    mode === "edit"
      ? "Editing comment"
      : highlightedComment && highlightedComment.line === line && highlightedComment.filename === composeFilename
        ? `Reply @ ${composeFile}:${line}`
        : `New comment @ ${composeFile}:${line}`

  const panelWidth = getPanelWidth(expanded)

  // Cap the rendered thread count when not expanded — the panel itself
  // clips overflow but mounting hundreds of MarkdownRenderables is a
  // measurable cost on first paint.
  const maxVisibleThreads = expanded ? 80 : 24
  const visible = pickVisibleThreads(threads, displayOrder, highlightedIndex, maxVisibleThreads)

  return Box(
    {
      position: "absolute",
      top: 0,
      right: 0,
      width: panelWidth,
      height: "100%",
      zIndex: 50,
      flexDirection: "column",
      backgroundColor: theme.base,
      overflow: "hidden",
      borderStyle: "single",
      borderColor: focused ? colors.primary : colors.border,
    },
    // Header — file + comment count. Mirrors FileTreePanel: 1-row tall,
    // single-column padding, mantle background. Focus is signalled by
    // the border + header text color.
    Box(
      {
        flexDirection: "row",
        justifyContent: "space-between",
        height: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.mantle,
      },
      Text({
        content: headerLabel,
        fg: focused ? colors.primary : colors.textMuted,
      }),
      Text({
        content: isComposing
          ? mode === "edit"
            ? "Editing"
            : "Composing"
          : `${comments.length} comment${comments.length !== 1 ? "s" : ""}`,
        fg: theme.overlay0,
      })
    ),

      // Thread list (or empty-state hint).
      comments.length > 0
        ? Box(
            {
              flexDirection: "column",
              paddingX: 2,
              paddingY: 1,
              gap: 1,
              flexGrow: 1,
            },
            visible.before > 0
              ? Text({
                  content: `↑ ${visible.before} earlier thread${visible.before !== 1 ? "s" : ""}`,
                  fg: theme.overlay0,
                })
              : null,
            ...visible.threads.flatMap((thread) => {
              const root = thread.comments[0]!
              // Show filename in the divider too when the panel is
              // unscoped (all-files view) — otherwise threads from
              // different files run together with no separator.
              const threadHeader = scopeFilename === null
                ? `─ ${(root.filename.split("/").pop() || root.filename)}:${root.line}`
                : `─ line ${root.line}`
              // Resolved threads collapse to a single header row by
              // default. `za`/Enter on a resolved thread expands it to
              // reveal the body + replies. Non-resolved threads always
              // show their body. Original-code context for outdated
              // threads is opt-in via `o` (opens the file in $EDITOR).
              const totalCount = thread.comments.length
              const isExpanded = expandedThreadIds.has(thread.id)
              const visibleComments =
                thread.resolved && !isExpanded ? [] : thread.comments
              const isThreadHighlighted =
                thread.resolved && !isExpanded && root.id === highlightedId
              return [
              Box(
                {
                  flexDirection: "row",
                  height: 1,
                  marginTop: 1,
                  backgroundColor: isThreadHighlighted ? theme.surface0 : undefined,
                },
                // Filename group — flexShrink:1 so the *filename* truncates
                // when the row is too narrow, instead of every child being
                // compressed (which dropped letters mid-word).
                Box(
                  { flexDirection: "row", flexShrink: 1, overflow: "hidden" },
                  thread.resolved
                    ? Text({
                        content: isThreadHighlighted ? "▸ " : "  ",
                        fg: isThreadHighlighted ? theme.blue : theme.overlay0,
                      })
                    : null,
                  Text({
                    content: threadHeader,
                    fg: theme.overlay0,
                  })
                ),
                // Badges group — flexShrink:0 so author / resolved / outdated
                // labels stay readable even on narrow panels.
                Box(
                  { flexDirection: "row", flexShrink: 0 },
                  thread.resolved
                    ? Text({ content: `  @${root.author || "you"}`, fg: theme.blue })
                    : null,
                  thread.resolved
                    ? Text({
                        content: totalCount > 1 ? `  ✓ ${totalCount}` : "  ✓",
                        fg: theme.green,
                      })
                    : null,
                  thread.outdated
                    ? Text({ content: "  ⊘", fg: theme.peach })
                    : null
                )
              ),
              ...visibleComments.map((comment, i) => {
                const isRoot = i === 0
                const author = comment.author || "you"
                const statusColor = getStatusColor(comment.status)
                const connector = isRoot ? "" : "└ "
                const isHighlighted = comment.id === highlightedId
                const isBeingEdited = comment.id === editingId

                // Each visual line is its own Box with `height: 1`
                // (PRInfoPanel pattern). Without explicit per-row
                // height, OpenTUI's column flex doesn't measure Text
                // and the rows stack on row 0 of the comment Box.
                // The body uses a MarkdownRenderable, which self-
                // measures correctly, so its wrapper Box doesn't need
                // a fixed height.
                const bodyIndent = isRoot ? 4 : 6
                const hasReactions =
                  comment.reactions !== undefined && comment.reactions.length > 0
                return Box(
                  {
                    flexDirection: "column",
                    paddingLeft: isRoot ? 0 : 2,
                    backgroundColor: isHighlighted ? theme.surface0 : undefined,
                  },
                  Box(
                    { flexDirection: "row", height: 1 },
                    Text({
                      content: isHighlighted ? "▸ " : "  ",
                      fg: isHighlighted ? theme.blue : theme.overlay0,
                    }),
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
                      : null
                  ),
                  Box(
                    { paddingLeft: bodyIndent },
                    buildMarkdown(
                      renderer,
                      `inline-overlay-body-${comment.id}`,
                      comment.localEdit ?? comment.body
                    )
                  ),
                  hasReactions
                    ? Box(
                        { flexDirection: "row", height: 1, paddingLeft: bodyIndent },
                        ReactionRow({ reactions: comment.reactions })
                      )
                    : null
                )
              }),
              ]
            }),
            visible.after > 0
              ? Text({
                  content: `↓ ${visible.after} more thread${visible.after !== 1 ? "s" : ""}`,
                  fg: theme.overlay0,
                })
              : null
          )
        : Box(
            { flexDirection: "column", paddingX: 2, paddingY: 1 },
            Text({
              content: "No comments in this file yet.",
              fg: theme.overlay0,
            })
          ),

      // Inline composer (compose / edit modes).
      isComposing
        ? Box(
            { flexDirection: "column", paddingX: 2, paddingY: 1 },
            CommentComposer({
              mode: mode === "edit" ? "edit" : "compose",
              label: composerLabel,
              renderer,
            }),
            isComposing && mentionPicker
              ? renderMentionPicker(mentionPicker, mentionCandidates)
              : null
          )
        : null,

    // Footer hints. Different set when focused vs unfocused so the
    // user always knows the next move. 1-row tall to match the header
    // and FileTreePanel's tight shell.
    Box(
      {
        flexDirection: "row",
        height: 1,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.mantle,
      },
      isComposing
        ? renderHintRow([
            ["Ctrl-s", "save"],
            ["Ctrl-j", "newline"],
            ["Esc", "cancel"],
          ])
        : renderHintRow(viewModeHints(canSubmit, comments.length > 0, focused))
    )
  )
}
