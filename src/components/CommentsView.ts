import { Box, Text, ScrollBox, h, MarkdownRenderable, SyntaxStyle, RGBA } from "@opentui/core"
import { colors, theme } from "../theme"
import type { Comment } from "../types"
import { 
  type Thread, 
  type ThreadNavItem, 
  groupIntoThreads, 
  flattenThreadsForNav,
} from "../utils/threads"

// Create a shared syntax style for markdown rendering
let sharedSyntaxStyle: SyntaxStyle | null = null
function getSyntaxStyle(): SyntaxStyle {
  if (!sharedSyntaxStyle) {
    sharedSyntaxStyle = SyntaxStyle.fromStyles({
      // Basic markdown styles using our theme
      "heading": { fg: RGBA.fromInts(137, 180, 250) }, // blue
      "strong": { bold: true },
      "emphasis": { italic: true },
      "code": { fg: RGBA.fromInts(166, 227, 161) }, // green
      "link": { fg: RGBA.fromInts(137, 180, 250), underline: true },
      "blockquote": { fg: RGBA.fromInts(166, 173, 200), italic: true }, // subtext0
    })
  }
  return sharedSyntaxStyle
}

export interface CommentsViewProps {
  comments: Comment[]
  selectedIndex: number
  selectedFilename: string | null  // null = showing all files
}

/**
 * Comments view - displays all comments/threads for current scope
 */
export function CommentsView({ comments, selectedIndex, selectedFilename }: CommentsViewProps) {
  const threads = groupIntoThreads(comments)
  const showFileHeaders = selectedFilename === null
  const items = flattenThreadsForNav(threads, showFileHeaders)
  
  if (comments.length === 0) {
    return Box(
      { width: "100%", height: "100%", flexDirection: "column" },
      // Empty state
      Box(
        { 
          flexGrow: 1, 
          justifyContent: "center", 
          alignItems: "center",
          flexDirection: "column",
          gap: 1,
        },
        Text({ content: "No comments yet", fg: colors.textDim }),
        Text({ content: "Press 'c' on a line in diff view to add one", fg: colors.textDim })
      )
    )
  }
  
  return Box(
    { width: "100%", height: "100%", flexDirection: "column" },
    // Scrollable content
    ScrollBox(
      { 
        id: "comments-view-scroll", 
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
        { flexDirection: "column", width: "100%", paddingX: 1, paddingY: 1 },
        ...items.map((item, i) => 
          renderNavItem(item, i === selectedIndex)
        )
      )
    )
  )
}

function renderNavItem(item: ThreadNavItem, selected: boolean): ReturnType<typeof Box> {
  if (item.type === "file-header") {
    return FileHeaderRow({ filename: item.filename!, selected })
  }
  
  return CommentRow({
    comment: item.comment!,
    isRoot: item.isRoot!,
    isLastInThread: item.isLastInThread!,
    indent: item.indent,
    selected,
  })
}

interface FileHeaderRowProps {
  filename: string
  selected: boolean
}

function FileHeaderRow({ filename, selected }: FileHeaderRowProps): ReturnType<typeof Box> {
  const bg = selected ? theme.surface1 : undefined
  
  return Box(
    { 
      width: "100%", 
      backgroundColor: bg,
      paddingTop: 1,
      paddingBottom: 1,
    },
    Text({ content: filename, fg: colors.primary })
  )
}

interface CommentRowProps {
  comment: Comment
  isRoot: boolean
  isLastInThread: boolean
  indent: number
  selected: boolean
}

/**
 * Extract context lines from a diff hunk.
 * Returns up to maxLines of relevant context, preserving diff markers.
 */
function extractContextLines(diffHunk: string | undefined, maxLines: number = 3): string[] {
  if (!diffHunk) return []
  
  // Split and filter empty lines, skip the @@ header
  const lines = diffHunk.split("\n").filter(l => l.trim() && !l.startsWith("@@"))
  if (lines.length === 0) return []
  
  // Take the last N lines (most relevant to the comment)
  return lines.slice(-maxLines)
}

/**
 * Render a code context block with proper styling
 */
function CodeContextBlock({ lines }: { lines: string[] }): ReturnType<typeof Box> {
  if (lines.length === 0) return null as unknown as ReturnType<typeof Box>
  
  return Box(
    {
      width: "100%",
      flexDirection: "column",
      backgroundColor: theme.surface0,
      paddingX: 1,
      paddingY: 0,
      marginBottom: 1,
    },
    ...lines.map((line) => {
      // Determine line type and color
      let fg: string = theme.overlay0
      if (line.startsWith("+")) fg = colors.addedFg
      else if (line.startsWith("-")) fg = colors.removedFg
      
      return Box(
        { flexDirection: "row", width: "100%" },
        Text({ content: line, fg })
      )
    })
  )
}

function CommentRow({ comment, isRoot, isLastInThread, indent, selected }: CommentRowProps): ReturnType<typeof Box> {
  const bg = selected ? theme.surface1 : undefined
  const marker = selected ? "> " : "  "
  
  // Build indent string with tree lines
  // For replies: use "└" for header, then "  " (space) for body lines if last in thread,
  // or "│" for body lines if more replies follow
  let headerIndent = ""
  let bodyIndent = ""
  if (indent > 0) {
    headerIndent = "  └ "
    // Body lines: if this is last reply, no connector needed; otherwise show continuing line
    bodyIndent = isLastInThread ? "    " : "  │ "
  }
  
  // Status badge
  const statusColor = getStatusColor(comment.status)
  const statusText = comment.status
  
  // Author
  const author = comment.author || "you"
  
  // Extract context lines from diff hunk (for root comments only)
  const contextLines = isRoot ? extractContextLines(comment.diffHunk, 3) : []
  const hasContext = contextLines.length > 0
  
  return Box(
    {
      width: "100%",
      flexDirection: "column",
      backgroundColor: bg,
      paddingTop: isRoot ? 1 : 0,
      paddingBottom: 1,
    },
    // Code context block (for root comments with diff context)
    isRoot && hasContext
      ? Box(
          { width: "100%", paddingLeft: 2 },
          CodeContextBlock({ lines: contextLines })
        )
      : null,
    // Header line: marker, indent, author, status (and line number if no context)
    Box(
      { flexDirection: "row", width: "100%" },
      Text({ content: marker, fg: selected ? colors.primary : colors.textDim }),
      Text({ content: headerIndent, fg: colors.textDim }),
      // Show line number only if no context available
      isRoot && !hasContext
        ? Text({ content: `L${comment.line} `, fg: theme.yellow })
        : null,
      Text({ content: `@${author}`, fg: theme.blue }),
      Text({ content: ` [${statusText}]`, fg: statusColor })
    ),
    // Body with markdown rendering (full content)
    Box(
      { flexDirection: "row", width: "100%", paddingLeft: 2 },
      Text({ content: bodyIndent, fg: colors.textDim }),
      Box(
        { flexGrow: 1, flexShrink: 1 },
        h(MarkdownRenderable, {
          content: comment.body,
          syntaxStyle: getSyntaxStyle(),
          conceal: true,
        })
      )
    )
  )
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

/**
 * Get the ScrollBox for programmatic scrolling
 */
export function getCommentsViewScrollBox(
  renderer: { root: { findDescendantById: (id: string) => unknown } }
): unknown {
  return renderer.root.findDescendantById("comments-view-scroll")
}
