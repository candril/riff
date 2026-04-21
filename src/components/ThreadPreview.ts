/**
 * Thread preview - quick view of a comment thread from the diff view.
 *
 * Shows comments for the current line in a simple modal overlay.
 * Triggered by Enter on a line with comments; dismissed with Esc or Enter.
 */

import { Box, Text, MarkdownRenderable, SyntaxStyle, RGBA } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme, colors } from "../theme"
import type { Comment } from "../types"
import { groupIntoThreads } from "../utils/threads"
import { ReactionRow } from "./ReactionRow"

export interface ThreadPreviewProps {
  comments: Comment[]
  filename: string
  line: number
  renderer: CliRenderer
  /** Index in `comments` of the focused entry — drives the React… palette
   *  action target and the visual focus marker (spec 042). */
  focusedIndex: number
}

// Shared syntax style for markdown rendering (lazy init)
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

/**
 * Get color for comment status
 */
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

/**
 * Format a relative time string
 */
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

export function ThreadPreview({ comments, filename, line, renderer, focusedIndex }: ThreadPreviewProps) {
  const threads = groupIntoThreads(comments)
  const shortFilename = filename.split("/").pop() || filename

  // Precompute visual index for each comment so the focus marker survives
  // thread grouping. Grouping is shallow (flat list across one thread in
  // practice), so this is just a lookup into `comments`.
  const visualIndexById = new Map<string, number>()
  let i = 0
  for (const thread of threads) {
    for (const c of thread.comments) {
      visualIndexById.set(c.id, i++)
    }
  }

  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 50,
      justifyContent: "center",
      alignItems: "center",
    },
    // Dim background
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000080" }),
    // Modal
    Box(
      {
        width: 72,
        flexDirection: "column",
        backgroundColor: theme.base,
        maxHeight: "80%",
        overflow: "hidden",
      },
      // Header
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        Text({ content: `${shortFilename}:${line}`, fg: theme.text }),
        Text({ content: "j/k · Ctrl+p React · Esc close", fg: theme.overlay0 })
      ),

      // Thread comments
      Box(
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
            const isFocused = visualIndexById.get(comment.id) === focusedIndex

            return Box(
              {
                flexDirection: "column",
                paddingLeft: isRoot ? 0 : 2,
              },
              // Header row: focus marker + connector + author + time + status
              Box(
                { flexDirection: "row" },
                Text({
                  content: isFocused ? "\u25B8 " : "  ",
                  fg: isFocused ? theme.yellow : colors.textDim,
                }),
                !isRoot
                  ? Text({ content: connector, fg: colors.textDim })
                  : null,
                Text({ content: `@${author}`, fg: theme.blue }),
                Text({ content: ` ${formatTimeAgo(comment.createdAt)}`, fg: theme.overlay0 }),
                Text({ content: ` [${comment.status}]`, fg: statusColor }),
                isRoot && thread.resolved
                  ? Text({ content: " \u2713", fg: theme.green })
                  : null
              ),
              // Body (markdown rendered)
              Box(
                {
                  paddingLeft: isRoot ? 2 : 4,
                },
                new MarkdownRenderable(renderer, {
                  id: `thread-preview-body-${comment.id}`,
                  content: comment.localEdit ?? comment.body,
                  syntaxStyle: getSyntaxStyle(),
                })
              ),
              // Reactions row (spec 042). Hidden when empty.
              Box(
                {
                  paddingLeft: isRoot ? 2 : 4,
                },
                ReactionRow({ reactions: comment.reactions })
              )
            )
          })
        )
      ),

      // Footer
      Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        Text({
          content: `${comments.length} comment${comments.length !== 1 ? "s" : ""}`,
          fg: theme.overlay0,
        })
      )
    )
  )
}
