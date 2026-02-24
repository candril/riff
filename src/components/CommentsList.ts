import { Box, Text, ScrollBox } from "@opentui/core"
import { colors, theme } from "../theme"
import type { Comment } from "../types"

export interface CommentsListProps {
  /** Comments to display */
  comments: Comment[]
  /** Selected index */
  selectedIndex: number
  /** Filename of current file */
  filename: string
}

/**
 * Overlay showing all comments for the current file
 */
export function CommentsList({ comments, selectedIndex, filename }: CommentsListProps) {
  const shortFilename = filename.split("/").pop() || filename
  
  return Box(
    {
      position: "absolute",
      top: 2,
      left: 4,
      right: 4,
      bottom: 4,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: colors.primary,
      backgroundColor: theme.base,
    },
    // Header
    Box(
      {
        width: "100%",
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.surface0,
        flexDirection: "row",
        justifyContent: "space-between",
      },
      Text({
        content: `Comments (${comments.length}) - ${shortFilename}`,
        fg: colors.primary,
      }),
      Text({
        content: "j/k: navigate  Enter: jump  d: delete  Esc: close",
        fg: colors.textDim,
      })
    ),
    // Divider
    Box(
      { width: "100%", height: 1, backgroundColor: theme.surface1 }
    ),
    // Comments list
    comments.length === 0
      ? Box(
          {
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          },
          Text({
            content: "No comments yet. Press 'c' on a line to add one.",
            fg: colors.textDim,
          })
        )
      : ScrollBox(
          {
            id: "comments-scroll",
            flexGrow: 1,
            width: "100%",
            scrollY: true,
            verticalScrollbarOptions: {
              showArrows: false,
              trackOptions: {
                backgroundColor: theme.surface0,
                foregroundColor: theme.surface2,
              },
            },
          },
          Box(
            {
              width: "100%",
              flexDirection: "column",
              paddingLeft: 1,
              paddingRight: 1,
            },
            ...comments.map((comment, index) =>
              CommentItem({ comment, selected: index === selectedIndex })
            )
          )
        )
  )
}

interface CommentItemProps {
  comment: Comment
  selected: boolean
}

function CommentItem({ comment, selected }: CommentItemProps) {
  const statusColor = comment.status === "local" 
    ? colors.commentLocal
    : comment.status === "pending"
      ? colors.commentPending
      : colors.commentSynced
  
  const statusLabel = comment.status === "local"
    ? "local"
    : comment.status === "pending"
      ? "pending"
      : "synced"
  
  const marker = selected ? "▶ " : "  "
  
  return Box(
    {
      width: "100%",
      flexDirection: "column",
      paddingTop: 1,
      paddingBottom: 1,
      backgroundColor: selected ? theme.surface1 : undefined,
      paddingLeft: 1,
    },
    // Line number and status
    Box(
      {
        width: "100%",
        flexDirection: "row",
        gap: 2,
      },
      Text({
        content: `${marker}Line ${comment.line}`,
        fg: colors.primary,
      }),
      Text({
        content: `[${statusLabel}]`,
        fg: statusColor,
      })
    ),
    // Comment body
    Text({
      content: `  ${comment.body}`,
      fg: colors.text,
    })
  )
}
