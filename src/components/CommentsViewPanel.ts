/**
 * Class-based CommentsView panel that updates in place without recreating the ScrollBox.
 * This prevents flickering when navigating with j/k.
 */

import {
  Box,
  Text,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  MarkdownRenderable,
  SyntaxStyle,
  RGBA,
  type CliRenderer,
} from "@opentui/core"
import type { Comment } from "../types"
import { 
  type ThreadNavItem, 
  groupIntoThreads, 
  flattenThreadsForNav,
} from "../utils/threads"
import { colors, theme } from "../theme"

// Create a shared syntax style for markdown rendering
// Scope names must match what MarkdownRenderable expects (markup.* prefixes)
// Also includes code highlighting styles for fenced code blocks
// Created lazily on first use
let sharedSyntaxStyle: SyntaxStyle | null = null
function getSyntaxStyle(): SyntaxStyle {
  if (!sharedSyntaxStyle) {
    sharedSyntaxStyle = SyntaxStyle.fromStyles({
      // Markdown-specific styles (markup.* scopes)
      "markup.heading": { fg: RGBA.fromHex(theme.blue), bold: true },
      "markup.strong": { bold: true },
      "markup.italic": { italic: true },
      "markup.raw": { fg: RGBA.fromHex(theme.green) }, // inline code
      "markup.strikethrough": { dim: true },
      "markup.link": { fg: RGBA.fromHex(theme.blue) },
      "markup.link.label": { fg: RGBA.fromHex(theme.blue), underline: true },
      "markup.link.url": { fg: RGBA.fromHex(theme.subtext0) },
      "markup.list": { fg: RGBA.fromHex(theme.yellow) },
      "punctuation.special": { fg: RGBA.fromHex(theme.subtext0), italic: true }, // blockquote >
      
      // Code syntax highlighting (for fenced code blocks)
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

export interface CommentsViewPanelOptions {
  renderer: CliRenderer
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
 * Get diff line color based on prefix
 */
function getDiffLineColor(line: string): string {
  if (line.startsWith("+")) return colors.addedFg
  if (line.startsWith("-")) return colors.removedFg
  return theme.overlay0
}

export class CommentsViewPanel {
  private renderer: CliRenderer
  private container: BoxRenderable
  private scrollBox: ScrollBoxRenderable
  private content: BoxRenderable
  private emptyStateContainer: BoxRenderable

  // Current state for change detection
  private lastComments: Comment[] | null = null
  private lastSelectedIndex: number = -1
  private lastSelectedFilename: string | null | undefined = undefined
  private lastCollapsedThreadIds: Set<string> | null = null

  constructor(options: CommentsViewPanelOptions) {
    this.renderer = options.renderer

    // Create container
    this.container = new BoxRenderable(this.renderer, {
      id: "comments-view-panel",
      width: "100%",
      height: "100%",
      flexDirection: "column",
    })

    // Create scroll box
    this.scrollBox = new ScrollBoxRenderable(this.renderer, {
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
    })

    // Create content container inside scroll box
    this.content = new BoxRenderable(this.renderer, {
      id: "comments-view-content",
      flexDirection: "column",
      width: "100%",
      paddingX: 1,
      paddingY: 1,
    })
    this.scrollBox.add(this.content)
    this.container.add(this.scrollBox)

    // Create empty state container (not added initially)
    this.emptyStateContainer = new BoxRenderable(this.renderer, {
      id: "comments-empty-state",
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      gap: 1,
    })
    this.emptyStateContainer.add(new TextRenderable(this.renderer, {
      content: "No comments yet",
      fg: colors.textDim,
    }))
    this.emptyStateContainer.add(new TextRenderable(this.renderer, {
      content: "Press 'c' on a line in diff view to add one",
      fg: colors.textDim,
    }))
  }

  getContainer(): BoxRenderable {
    return this.container
  }

  getScrollBox(): ScrollBoxRenderable {
    return this.scrollBox
  }

  /**
   * Scroll to ensure the selected item is visible.
   * Call this after updating selection.
   */
  ensureSelectedVisible(selectedIndex: number): void {
    // Try to find the actual rendered item
    const itemId = `comment-nav-${selectedIndex}`
    const item = this.content.getChildren().find(c => c.id === itemId) as BoxRenderable | undefined
    
    if (item) {
      // Use actual item position and height
      const itemY = item.y
      const itemHeight = item.height || 4
      
      const scrollTop = this.scrollBox.scrollTop
      const viewportHeight = Math.floor(this.scrollBox.height || 20)
      const margin = 1
      
      if (itemY < scrollTop + margin) {
        // Item is above viewport
        this.scrollBox.scrollTop = Math.max(0, itemY - margin)
      } else if (itemY + itemHeight > scrollTop + viewportHeight - margin) {
        // Item is below viewport
        this.scrollBox.scrollTop = itemY + itemHeight - viewportHeight + margin
      }
    }
  }

  /**
   * Update the view with new state.
   */
  update(
    comments: Comment[],
    selectedIndex: number,
    selectedFilename: string | null,
    collapsedThreadIds?: Set<string>
  ): void {
    // Handle empty state toggle
    const wasEmpty = this.lastComments !== null && this.lastComments.length === 0
    const isEmpty = comments.length === 0

    if (isEmpty && !wasEmpty) {
      // Switch to empty state
      this.container.remove(this.scrollBox.id)
      this.container.add(this.emptyStateContainer)
    } else if (!isEmpty && wasEmpty) {
      // Switch from empty state
      this.container.remove(this.emptyStateContainer.id)
      this.container.add(this.scrollBox)
    }

    if (isEmpty) {
      this.lastComments = comments
      this.lastSelectedIndex = selectedIndex
      this.lastSelectedFilename = selectedFilename
      this.lastCollapsedThreadIds = collapsedThreadIds ?? null
      return
    }

    // Check what changed
    const commentsChanged = comments !== this.lastComments
    const selectionChanged = selectedIndex !== this.lastSelectedIndex
    const filenameChanged = selectedFilename !== this.lastSelectedFilename
    const collapsedChanged = collapsedThreadIds !== this.lastCollapsedThreadIds

    // Update state tracking
    this.lastComments = comments
    this.lastSelectedIndex = selectedIndex
    this.lastSelectedFilename = selectedFilename
    this.lastCollapsedThreadIds = collapsedThreadIds ?? null

    // Only rebuild if something changed
    if (commentsChanged || selectionChanged || filenameChanged || collapsedChanged) {
      this.rebuildContent(comments, selectedIndex, selectedFilename, collapsedThreadIds)
    }
  }

  /**
   * Rebuild all content
   */
  private rebuildContent(
    comments: Comment[],
    selectedIndex: number,
    selectedFilename: string | null,
    collapsedThreadIds?: Set<string>
  ): void {
    // Clear existing content
    for (const child of this.content.getChildren()) {
      this.content.remove(child.id)
    }

    // Build nav items
    const threads = groupIntoThreads(comments)
    const showFileHeaders = selectedFilename === null
    const navItems = flattenThreadsForNav(threads, showFileHeaders, collapsedThreadIds)

    // Create items
    for (let i = 0; i < navItems.length; i++) {
      const item = navItems[i]!
      const isSelected = i === selectedIndex
      const itemBox = this.createNavItem(item, isSelected, i)
      this.content.add(itemBox)
    }
  }

  /**
   * Create a nav item renderable
   */
  private createNavItem(
    item: ThreadNavItem,
    selected: boolean,
    index: number
  ): BoxRenderable {
    if (item.type === "file-header") {
      return this.createFileHeader(item.filename!, selected, index)
    }
    return this.createCommentRow(item, selected, index)
  }

  /**
   * Create a file header row
   */
  private createFileHeader(
    filename: string,
    selected: boolean,
    index: number
  ): BoxRenderable {
    const box = new BoxRenderable(this.renderer, {
      id: `comment-nav-${index}`,
      width: "100%",
      backgroundColor: selected ? theme.surface1 : undefined,
      paddingTop: 1,
      paddingBottom: 1,
    })
    box.add(new TextRenderable(this.renderer, {
      content: filename,
      fg: colors.primary,
    }))
    return box
  }

  /**
   * Create a comment row with all features (context, indentation, etc.)
   */
  private createCommentRow(
    item: ThreadNavItem,
    selected: boolean,
    index: number
  ): BoxRenderable {
    const comment = item.comment!
    const isRoot = item.isRoot!
    const author = comment.author || "you"
    const statusColor = getStatusColor(comment.status)
    const marker = selected ? "> " : "  "

    // Collapsed view: minimal one-line representation
    if (item.isCollapsed) {
      return this.createCollapsedRow(item, comment, author, statusColor, marker, selected, index)
    }

    // Expanded view: full comment with context and body
    return this.createExpandedRow(item, comment, author, statusColor, marker, selected, index)
  }

  /**
   * Create a minimal collapsed row (one line, no context)
   */
  private createCollapsedRow(
    item: ThreadNavItem,
    comment: Comment,
    author: string,
    _statusColor: string,
    marker: string,
    selected: boolean,
    index: number
  ): BoxRenderable {
    const box = new BoxRenderable(this.renderer, {
      id: `comment-nav-${index}`,
      width: "100%",
      flexDirection: "row",
      backgroundColor: selected ? theme.surface1 : undefined,
      paddingY: 0,
    })

    // Marker
    box.add(new TextRenderable(this.renderer, {
      content: marker,
      fg: selected ? colors.primary : colors.textDim,
    }))

    // Author
    box.add(new TextRenderable(this.renderer, {
      content: `@${author}`,
      fg: theme.blue,
    }))

    // Truncated body preview (first ~40 chars)
    const preview = comment.body.replace(/\n/g, " ").slice(0, 40)
    const truncated = comment.body.length > 40 ? preview + "..." : preview
    box.add(new TextRenderable(this.renderer, {
      content: ` "${truncated}"`,
      fg: colors.textDim,
    }))

    // Reply count if any
    if (item.replyCount && item.replyCount > 0) {
      box.add(new TextRenderable(this.renderer, {
        content: ` (+${item.replyCount})`,
        fg: theme.overlay0,
      }))
    }

    // Resolved indicator at the end
    if (item.thread?.resolved) {
      box.add(new TextRenderable(this.renderer, {
        content: " ✓",
        fg: theme.green,
      }))
    }

    return box
  }

  /**
   * Create a full expanded row with context and body
   */
  private createExpandedRow(
    item: ThreadNavItem,
    comment: Comment,
    author: string,
    statusColor: string,
    marker: string,
    selected: boolean,
    index: number
  ): BoxRenderable {
    const isRoot = item.isRoot!
    const isLastInThread = item.isLastInThread!
    const indent = item.indent

    const headerIndent = indent > 0 ? "  └ " : ""
    const bodyIndent = indent > 0 ? (isLastInThread ? "    " : "  │ ") : ""

    // Extract context lines from diff hunk (for root comments only)
    const contextLines = isRoot ? extractContextLines(comment.diffHunk, 3) : []
    const hasContext = contextLines.length > 0

    const box = new BoxRenderable(this.renderer, {
      id: `comment-nav-${index}`,
      width: "100%",
      flexDirection: "column",
      backgroundColor: selected ? theme.surface1 : undefined,
      paddingTop: isRoot ? 1 : 0,
      paddingBottom: 1,
    })

    // Code context block (for root comments with diff context)
    if (isRoot && hasContext) {
      const contextWrapper = new BoxRenderable(this.renderer, {
        width: "100%",
        paddingLeft: 2,
      })
      const contextBlock = new BoxRenderable(this.renderer, {
        width: "100%",
        flexDirection: "column",
        backgroundColor: theme.surface0,
        paddingX: 1,
        paddingY: 0,
        marginBottom: 1,
      })
      for (const line of contextLines) {
        const lineBox = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          width: "100%",
        })
        lineBox.add(new TextRenderable(this.renderer, {
          content: line,
          fg: getDiffLineColor(line),
        }))
        contextBlock.add(lineBox)
      }
      contextWrapper.add(contextBlock)
      box.add(contextWrapper)
    }

    // Header line: marker, indent, author, status (and line number if no context)
    const headerRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      width: "100%",
    })
    headerRow.add(new TextRenderable(this.renderer, {
      content: marker,
      fg: selected ? colors.primary : colors.textDim,
    }))
    headerRow.add(new TextRenderable(this.renderer, {
      content: headerIndent,
      fg: colors.textDim,
    }))
    // Show line number only if no context available
    if (isRoot && !hasContext) {
      headerRow.add(new TextRenderable(this.renderer, {
        content: `L${comment.line} `,
        fg: theme.yellow,
      }))
    }
    headerRow.add(new TextRenderable(this.renderer, {
      content: `@${author}`,
      fg: theme.blue,
    }))
    headerRow.add(new TextRenderable(this.renderer, {
      content: ` [${comment.status}]`,
      fg: statusColor,
    }))
    // Resolved indicator (✓) - shown only on root comments of resolved threads
    if (isRoot && item.thread?.resolved) {
      headerRow.add(new TextRenderable(this.renderer, {
        content: " ✓",
        fg: theme.green,
      }))
    }
    // Reply count indicator for expanded threads with replies
    if (isRoot && item.thread && item.thread.comments.length > 1) {
      headerRow.add(new TextRenderable(this.renderer, {
        content: ` (${item.thread.comments.length - 1} ${item.thread.comments.length === 2 ? "reply" : "replies"})`,
        fg: theme.overlay0,
      }))
    }
    box.add(headerRow)

    // Body line with markdown rendering
    const bodyRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      width: "100%",
      paddingLeft: 2,
    })
    bodyRow.add(new TextRenderable(this.renderer, {
      content: bodyIndent,
      fg: colors.textDim,
    }))
    // Use MarkdownRenderable for rich text (bold, italic, code, etc.)
    const markdownBody = new MarkdownRenderable(this.renderer, {
      id: `comment-body-${comment.id}`,
      content: comment.body,
      syntaxStyle: getSyntaxStyle(),
    })
    bodyRow.add(markdownBody)
    box.add(bodyRow)

    return box
  }
}
