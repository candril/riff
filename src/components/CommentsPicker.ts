import { Box, Text } from "@opentui/core"
import { theme, colors } from "../theme"
import type { CommentsPickerEntry } from "../features/comments-picker"

export interface CommentsPickerProps {
  query: string
  entries: CommentsPickerEntry[]
  selectedIndex: number
}

const MAX_VISIBLE = 20

/**
 * Comments picker overlay (spec 044). PR-wide fuzzy search across every
 * comment in the diff. Modeled on FilePicker for visual consistency.
 */
export function CommentsPicker({ query, entries, selectedIndex }: CommentsPickerProps) {
  const total = entries.length
  let startIndex = 0
  if (total > MAX_VISIBLE) {
    startIndex = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(MAX_VISIBLE / 2), total - MAX_VISIBLE)
    )
  }
  const endIndex = Math.min(startIndex + MAX_VISIBLE, total)
  const visible = entries.slice(startIndex, endIndex)
  const countText = total > 0 ? `${selectedIndex + 1}/${total}` : "0"

  return Box(
    {
      id: "comments-picker-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
    },
    Box({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: "#00000080",
    }),
    Box(
      {
        position: "absolute",
        top: 2,
        left: "15%",
        width: "70%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
      },
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: "Find Comments", fg: theme.subtext0 }),
        Box(
          { flexDirection: "row", gap: 2 },
          Text({ content: countText, fg: theme.overlay0 }),
          Text({ content: "esc", fg: theme.overlay0 })
        )
      ),
      Box(
        {
          id: "comments-picker-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
        },
        query
          ? Text({ content: query, fg: theme.text })
          : Text({ content: "Type to search…", fg: theme.overlay0 })
      ),
      Box(
        {
          flexDirection: "column",
          paddingBottom: 1,
        },
        startIndex > 0
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: `↑ ${startIndex} more`, fg: theme.overlay0 })
            )
          : null,
        ...visible.map((entry, i) =>
          CommentRow({
            entry,
            selected: startIndex + i === selectedIndex,
          })
        ),
        endIndex < total
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: `↓ ${total - endIndex} more`, fg: theme.overlay0 })
            )
          : null,
        total === 0
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: "No comments", fg: theme.overlay0 })
            )
          : null
      )
    )
  )
}

interface CommentRowProps {
  entry: CommentsPickerEntry
  selected: boolean
}

function statusGlyph(entry: CommentsPickerEntry): { glyph: string; fg: string } {
  if (!entry.isRoot) {
    return { glyph: "↳", fg: theme.overlay0 }
  }
  if (entry.threadResolved) {
    return { glyph: "✓", fg: colors.commentResolved }
  }
  switch (entry.comment.status) {
    case "local":
      return { glyph: "●", fg: colors.commentLocal }
    case "pending":
      return { glyph: "○", fg: colors.commentPending }
    case "synced":
      return { glyph: "·", fg: colors.commentSynced }
  }
}

function CommentRow({ entry, selected }: CommentRowProps) {
  const bg = selected ? theme.surface2 : undefined
  const baseFg = selected ? theme.text : theme.subtext1
  const dimFg = selected ? theme.subtext0 : theme.overlay0
  const { glyph, fg: glyphFg } = statusGlyph(entry)

  const location = `${entry.comment.filename}:${entry.comment.line}`
  const author = entry.comment.author ? `@${entry.comment.author}` : ""

  return Box(
    {
      flexDirection: "row",
      backgroundColor: bg,
      paddingX: 2,
      width: "100%",
    },
    Box(
      { flexDirection: "row", width: 2 },
      Text({ content: glyph, fg: glyphFg })
    ),
    Box(
      { flexDirection: "row", flexShrink: 0 },
      Text({ content: ` ${location} `, fg: baseFg })
    ),
    Box(
      { flexDirection: "row", flexGrow: 1 },
      Text({ content: entry.preview, fg: dimFg })
    ),
    author
      ? Box(
          { flexDirection: "row" },
          Text({ content: ` ${author}`, fg: theme.overlay0 })
        )
      : null
  )
}
