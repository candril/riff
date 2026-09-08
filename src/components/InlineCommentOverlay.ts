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
import { groupIntoThreads, isThreadCollapsed, type Thread } from "../utils/threads"
import { extractCommentImages, type CommentImage } from "../utils/comment-images"
import { fuzzyFilter } from "../utils/fuzzy"
import { ReactionRow } from "./ReactionRow"
import { CommentComposer } from "./CommentComposer"

export const MENTION_VISIBLE_LIMIT = 6

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
  /** Local diffs have nowhere to publish to — hints must not promise it. */
  appMode: "local" | "pr"
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
  /** Fragment currently being looked up on GitHub, or null when idle. */
  mentionSearchQuery: string | null
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
 * Stand-in rows for the pictures a comment carries — the panel can't draw
 * them, so it names them and `O` opens them in the browser. Numbered only
 * when there is more than one, since the number is there to tell the reader
 * which of several `O` is about to open.
 */
function imageRows(images: readonly CommentImage[], indent: number) {
  return images.map((image, i) =>
    Box(
      { flexDirection: "row", height: 1, paddingLeft: indent },
      Text({ content: "▣ ", fg: theme.overlay0 }),
      images.length > 1
        ? Text({ content: `${i + 1}. `, fg: theme.overlay0 })
        : null,
      Text({ content: image.label, fg: theme.sapphire })
    )
  )
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

function viewModeHints(
  canSubmit: boolean,
  hasComments: boolean,
  focused: boolean,
  appMode: "local" | "pr",
  hasImages: boolean
): Hint[] {
  if (!focused) {
    return [["Ctrl-l", "focus"], ["Ctrl-t", "close"]]
  }
  const hints: Hint[] = [["n", "new"]]
  if (hasComments) {
    hints.push(["j/k", "nav"], ["za", "fold"], ["r", "reply"], ["e", "edit"], ["d", "del"], ["x", "resolve"], ["o", "open"])
    if (hasImages) hints.push(["O", "image"])
    // Nothing to submit to in local mode; the key is a no-op there.
    if (canSubmit && appMode === "pr") hints.push(["S", "submit"])
  }
  hints.push(["Ctrl-h", "diff"], ["Ctrl-e", "expand"], ["q", "close"])
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
 * Decide which threads to render around the highlighted comment.
 *
 * This doubles as the panel's scroll model. The clipping viewport is
 * rebuilt every frame with its content pinned at the top — only content
 * near the top of the column is on-screen. So we render *starting* a
 * couple of threads above the highlighted one: that keeps the highlighted
 * thread near the top of the viewport (with a little preceding context)
 * and, because the start point follows the cursor, the view scrolls as
 * the user moves through threads with j/k. `windowSize` caps how many
 * threads mount at once — the viewport clips whatever runs past the
 * bottom.
 *
 * Note this is thread-granular: navigating *within* a very tall thread
 * (many replies) doesn't re-scroll, so a deep reply in an oversized
 * thread can fall below the fold. Pixel-accurate scroll-off would need a
 * persistent panel that reads real layout offsets (cf. FileTreePanel).
 */
const WINDOW_LEAD = 2

function pickVisibleThreads(
  threads: Thread[],
  displayOrder: Comment[],
  highlightedIndex: number,
  windowSize: number
): { threads: Thread[]; before: number; after: number } {
  const highlightedId = displayOrder[highlightedIndex]?.id
  const highlightedThreadIdx = highlightedId
    ? threads.findIndex((t) => t.comments.some((c) => c.id === highlightedId))
    : 0
  const start = Math.max(0, highlightedThreadIdx - WINDOW_LEAD)
  const end = Math.min(threads.length, start + windowSize)
  return {
    threads: threads.slice(start, end),
    before: start,
    after: threads.length - end,
  }
}

/**
 * Distinguish "nobody matches" from "still asking GitHub" — the lookup takes
 * about half a second, and without the hint that reads as a dead picker.
 */
function emptyPickerMessage(query: string, searchQuery: string | null): string {
  if (!query) return "No participants to mention"
  if (searchQuery === query) return `Searching GitHub for @${query}…`
  return `No match for @${query}`
}

function renderMentionPicker(
  picker: MentionPickerState,
  candidates: readonly string[],
  searchQuery: string | null
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
        content: emptyPickerMessage(picker.query, searchQuery),
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
        Text({ content: displayAuthor(name), fg: theme.text })
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

/**
 * Comments written offline are stored with the placeholder author `@you`,
 * already `@`-prefixed, while GitHub logins are bare. Prefixing blindly
 * rendered the local ones as `@@you`.
 */
function displayAuthor(author: string): string {
  return author.startsWith("@") ? author : `@${author}`
}

export function InlineCommentOverlay({
  comments,
  scopeFilename,
  composeFilename,
  line,
  mode,
  appMode,
  highlightedIndex,
  editingId,
  focused,
  expanded,
  mentionPicker,
  mentionCandidates,
  mentionSearchQuery,
  expandedThreadIds,
  renderer,
}: InlineCommentOverlayProps) {
  const threads = groupIntoThreads(comments)
  const headerLabel = scopeFilename
    ? scopeFilename.split("/").pop() || scopeFilename
    : "all files"
  // A collapsed thread is one navigable item (its root header); an
  // expanded thread exposes every comment. Must mirror
  // `getInlineCommentOverlayDisplayOrder` and the `visibleComments` rule
  // below so j/k indices align with what's drawn.
  const displayOrder: Comment[] = threads.flatMap((t) =>
    isThreadCollapsed(t, expandedThreadIds) ? [t.comments[0]!] : t.comments
  )
  const highlightedId = displayOrder[highlightedIndex]?.id
  const highlightedComment = displayOrder[highlightedIndex]
  const canSubmit = highlightedComment
    ? highlightedComment.status === "local" || highlightedComment.localEdit !== undefined
    : false
  const highlightedHasImages = highlightedComment
    ? extractCommentImages(highlightedComment.localEdit ?? highlightedComment.body).images.length > 0
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

  // Cap the rendered thread count when not expanded — the viewport
  // clips overflow, but mounting hundreds of MarkdownRenderables is a
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

      // Thread list (or empty-state hint). Two nested boxes reproduce a
      // scroll viewport without a ScrollBox — deliberately, since we
      // never actually scroll (the panel is rebuilt every frame and we
      // fake scrolling by windowing which threads render, so a real
      // scrollbar's thumb would just recompute and flicker each frame
      // while showing a bogus position).
      //
      //  - Outer box: `overflow: hidden` on a flexGrow child of the
      //    fixed-height panel — a clipping viewport (this is exactly what
      //    ScrollBox's viewport is under the hood).
      //  - Inner box: `flexShrink: 0` so the comment stack keeps each
      //    box at its text's natural height and simply overflows, instead
      //    of the flex column compressing them below that height — which
      //    crushed the Text renderables into each other (the "scramble"
      //    that a smaller terminal font hid by giving the panel more rows).
      comments.length > 0
        ? Box(
            {
              flexDirection: "column",
              overflow: "hidden",
              flexGrow: 1,
              width: "100%",
              paddingLeft: 2,
              paddingRight: 2,
              paddingTop: 1,
              paddingBottom: 1,
            },
            Box(
            {
              flexDirection: "column",
              width: "100%",
              flexShrink: 0,
              gap: 1,
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
              // Collapsed threads render as a single header row; `za`/Enter
              // folds/unfolds. Resolved threads default to collapsed
              // (scannable), everything else defaults to expanded — the
              // `expandedThreadIds` set flips that default. Original-code
              // context for outdated threads is opt-in via `o` (opens the
              // file in $EDITOR).
              const totalCount = thread.comments.length
              const isCollapsed = isThreadCollapsed(thread, expandedThreadIds)
              const visibleComments = isCollapsed ? [] : thread.comments
              const isThreadHighlighted = isCollapsed && root.id === highlightedId
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
                  // Collapsed threads are the navigable item, so they carry
                  // the highlight caret on the header itself.
                  isCollapsed
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
                // Badges group — flexShrink:0 so author / count / resolved /
                // outdated labels stay readable even on narrow panels.
                Box(
                  { flexDirection: "row", flexShrink: 0 },
                  isCollapsed
                    ? Text({ content: `  @${root.author || "you"}`, fg: theme.blue })
                    : null,
                  thread.resolved
                    ? Text({
                        content: totalCount > 1 ? `  ✓ ${totalCount}` : "  ✓",
                        fg: theme.green,
                      })
                    : isCollapsed
                      ? Text({
                          content: totalCount > 1 ? `  ⋯ ${totalCount}` : "  ⋯",
                          fg: theme.overlay0,
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
                const body = extractCommentImages(comment.localEdit ?? comment.body)
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
                    Text({ content: displayAuthor(author), fg: theme.blue }),
                    Text({ content: ` ${formatTimeAgo(comment.createdAt)}`, fg: theme.overlay0 }),
                    Text({ content: ` [${comment.status}]`, fg: statusColor }),
                    comment.localEdit !== undefined
                      ? Text({ content: " *edited", fg: colors.commentPending })
                      : null,
                    isBeingEdited
                      ? Text({ content: " (editing)", fg: theme.yellow })
                      : null
                  ),
                  body.text
                    ? Box(
                        { paddingLeft: bodyIndent },
                        buildMarkdown(
                          renderer,
                          `inline-overlay-body-${comment.id}`,
                          body.text
                        )
                      )
                    : null,
                  ...imageRows(body.images, bodyIndent),
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
          )
        : Box(
            { flexDirection: "column", paddingX: 2, paddingY: 1 },
            Text({
              content: "No comments in this file yet.",
              fg: theme.overlay0,
            })
          ),

      // Inline composer (compose / edit modes). `flexShrink: 0` — the
      // thread viewport above has a huge flex basis (its inner stack
      // never shrinks), and Yoga spreads the overflow across every
      // shrinkable sibling by basis, so without this the composer lost
      // rows too: its label row collapsed onto the textarea (label and
      // placeholder glyphs interleaved) and its bottom edge slid under
      // the footer.
      isComposing
        ? Box(
            { flexDirection: "column", paddingX: 2, paddingY: 1, flexShrink: 0 },
            CommentComposer({
              mode: mode === "edit" ? "edit" : "compose",
              label: composerLabel,
              renderer,
            }),
            isComposing && mentionPicker
              ? renderMentionPicker(mentionPicker, mentionCandidates, mentionSearchQuery)
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
        ? renderHintRow(
            appMode === "pr"
              ? [
                  ["Enter", "save"],
                  ["Ctrl-p", "save & publish"],
                  ["Ctrl-j", "newline"],
                  ["Esc", "cancel"],
                ]
              : [
                  ["Enter", "save"],
                  ["Ctrl-j", "newline"],
                  ["Ctrl-g", "$EDITOR"],
                  ["Esc", "cancel"],
                ],
          )
        : renderHintRow(
            viewModeHints(canSubmit, comments.length > 0, focused, appMode, highlightedHasImages)
          )
    )
  )
}
