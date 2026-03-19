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
import type { CommentsSearchState } from "../state"
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
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
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
  private lastSearchState: CommentsSearchState | null = null

  // Empty state text elements (for dynamic update)
  private emptyTitle: TextRenderable
  private emptySubtitle: TextRenderable

  // Precomputed item positions (in terminal rows) for scroll navigation.
  // Computed during rebuildContent() so they're available immediately.
  private itemTops: number[] = []
  private itemHeights: number[] = []
  private totalContentHeight: number = 0

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
    this.emptyTitle = new TextRenderable(this.renderer, {
      content: "No comments yet",
      fg: colors.textDim,
    })
    this.emptySubtitle = new TextRenderable(this.renderer, {
      content: "Press 'c' on a line in diff view to add one",
      fg: colors.textDim,
    })
    this.emptyStateContainer.add(this.emptyTitle)
    this.emptyStateContainer.add(this.emptySubtitle)
  }

  getContainer(): BoxRenderable {
    return this.container
  }

  getScrollBox(): ScrollBoxRenderable {
    return this.scrollBox
  }

  /**
   * Scroll to ensure the selected item is visible.
   * Uses precomputed row positions from rebuildContent().
   */
  ensureSelectedVisible(selectedIndex: number): void {
    if (selectedIndex < 0 || selectedIndex >= this.itemTops.length) return

    const itemTop = this.itemTops[selectedIndex]!
    const itemHeight = this.itemHeights[selectedIndex]!
    const itemBottom = itemTop + itemHeight
    const scrollTop = this.scrollBox.scrollTop
    const viewportHeight = Math.floor(this.scrollBox.height || 20)

    if (itemTop < scrollTop) {
      // Item is above viewport - scroll up to show it
      this.scrollBox.scrollTop = itemTop
    } else if (itemBottom > scrollTop + viewportHeight) {
      // Item is below viewport - scroll down so it's at bottom
      this.scrollBox.scrollTop = itemBottom - viewportHeight
    }
  }

  /**
   * Find which nav item index is at a given scroll position (in rows).
   * Used by half-page scrolling to move the selection to match the viewport.
   */
  findItemAtScrollPosition(scrollY: number): number {
    for (let i = 0; i < this.itemTops.length; i++) {
      const top = this.itemTops[i]!
      const height = this.itemHeights[i]!
      if (top + height > scrollY) {
        return i
      }
    }
    return Math.max(0, this.itemTops.length - 1)
  }

  /**
   * Update the view with new state.
   */
  update(
    comments: Comment[],
    selectedIndex: number,
    selectedFilename: string | null,
    collapsedThreadIds?: Set<string>,
    searchState?: CommentsSearchState
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

    // Update empty state text based on whether a search filter is active
    if (isEmpty) {
      if (searchState?.query) {
        this.emptyTitle.content = "No matching comments"
        this.emptySubtitle.content = "Press Esc to clear the search filter"
      } else {
        this.emptyTitle.content = "No comments yet"
        this.emptySubtitle.content = "Press 'c' on a line in diff view to add one"
      }
    }

    if (isEmpty) {
      this.lastComments = comments
      this.lastSelectedIndex = selectedIndex
      this.lastSelectedFilename = selectedFilename
      this.lastCollapsedThreadIds = collapsedThreadIds ?? null
      this.lastSearchState = searchState ?? null
      return
    }

    // Check what changed
    const commentsChanged = comments !== this.lastComments
    const selectionChanged = selectedIndex !== this.lastSelectedIndex
    const filenameChanged = selectedFilename !== this.lastSelectedFilename
    const collapsedChanged = collapsedThreadIds !== this.lastCollapsedThreadIds
    const searchChanged = searchState?.query !== this.lastSearchState?.query ||
      searchState?.active !== this.lastSearchState?.active

    // Update state tracking
    this.lastComments = comments
    this.lastSelectedIndex = selectedIndex
    this.lastSelectedFilename = selectedFilename
    this.lastCollapsedThreadIds = collapsedThreadIds ?? null
    this.lastSearchState = searchState ?? null

    // Only rebuild if something changed
    if (commentsChanged || selectionChanged || filenameChanged || collapsedChanged || searchChanged) {
      this.rebuildContent(comments, selectedIndex, selectedFilename, collapsedThreadIds)
    }
  }

  /**
   * Rebuild all content and precompute item positions.
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

    // Reset position tracking
    this.itemTops = []
    this.itemHeights = []
    let currentY = 0

    // Create items and compute positions
    for (let i = 0; i < navItems.length; i++) {
      const item = navItems[i]!
      const isSelected = i === selectedIndex
      const itemBox = this.createNavItem(item, isSelected, i)
      this.content.add(itemBox)

      const height = this.estimateItemHeight(item, i)
      this.itemTops.push(currentY)
      this.itemHeights.push(height)
      currentY += height
    }

    this.totalContentHeight = currentY
  }

  /**
   * Estimate the height of a nav item in terminal rows.
   * Must match the padding/structure in create*Row methods.
   */
  private estimateItemHeight(item: ThreadNavItem, index: number): number {
    if (item.type === "file-header") {
      // paddingTop: (index === 0 ? 0 : 1) + 1 text line
      return (index === 0 ? 0 : 1) + 1
    }

    if (item.isCollapsed) {
      // Single line, no padding
      return 1
    }

    // Expanded comment: paddingTop (1 for root, 0 for reply) + header (1) + body lines (if multi-line)
    const isRoot = item.isRoot!
    const paddingTop = isRoot ? 1 : 0
    const headerLines = 1
    const body = item.comment?.body ?? ""
    const shortBody = !body.includes("\n") && body.length <= 60
    const bodyLines = shortBody ? 0 : Math.max(1, body.split("\n").length)
    return paddingTop + headerLines + bodyLines
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
      paddingTop: index === 0 ? 0 : 1,
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
      content: author,
      fg: theme.blue,
    }))

    // Timestamp
    box.add(new TextRenderable(this.renderer, {
      content: ` ${formatTimeAgo(comment.createdAt)}`,
      fg: theme.overlay0,
    }))

    // Truncated body preview (first ~50 chars)
    const preview = comment.body.replace(/\n/g, " ").slice(0, 50)
    const truncated = comment.body.length > 50 ? preview + "..." : preview
    box.add(new TextRenderable(this.renderer, {
      content: ` · ${truncated}`,
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
   * Check if a comment body is short enough to inline on the header row.
   * Short = single line and <= 60 chars.
   */
  private isShortBody(body: string): boolean {
    return !body.includes("\n") && body.length <= 60
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
    const shortBody = this.isShortBody(comment.body)

    const headerIndent = indent > 0 ? "  └ " : ""
    const bodyIndent = indent > 0 ? (isLastInThread ? "    " : "  │ ") : ""

    const box = new BoxRenderable(this.renderer, {
      id: `comment-nav-${index}`,
      width: "100%",
      flexDirection: "column",
      backgroundColor: selected ? theme.surface1 : undefined,
      paddingTop: isRoot ? 1 : 0,
    })

    // Header line: marker, indent, author, time, [status if not synced], [inline body if short]
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
    headerRow.add(new TextRenderable(this.renderer, {
      content: author,
      fg: theme.blue,
    }))
    // Timestamp
    headerRow.add(new TextRenderable(this.renderer, {
      content: ` ${formatTimeAgo(comment.createdAt)}`,
      fg: theme.overlay0,
    }))
    // Only show status badge for non-synced comments
    if (comment.status !== "synced") {
      headerRow.add(new TextRenderable(this.renderer, {
        content: ` [${comment.status}]`,
        fg: statusColor,
      }))
    }
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
    // Short body: inline on the header row after a separator
    if (shortBody) {
      headerRow.add(new TextRenderable(this.renderer, {
        content: ` · ${comment.body}`,
        fg: theme.text,
      }))
    }
    box.add(headerRow)

    // Multi-line / long body: render below header with markdown
    if (!shortBody) {
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
    }

    return box
  }
}
