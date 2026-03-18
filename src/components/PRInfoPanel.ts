/**
 * PR Info Panel v2 - Section-based navigation
 * Shows PR metadata with collapsible sections navigated via Tab/j/k
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  MarkdownRenderable,
  SyntaxStyle,
  RGBA,
  type CliRenderer,
} from "@opentui/core"
import type { PrInfo, PrReview, PrCommit, PrConversationComment } from "../providers/github"
import type { DiffFile } from "../utils/diff-parser"
import type { Comment } from "../types"
import type { PRInfoPanelSection } from "../state"
import { colors, theme } from "../theme"

/**
 * Unified conversation item for display
 */
type ConversationItem = 
  | { type: 'pr-comment'; data: PrConversationComment }
  | { type: 'review'; data: ReviewWithThreads }
  | { type: 'pending-reviewer'; data: string }

/**
 * Flattened conversation item (for navigation when reviews are expanded)
 */
type FlatConversationItem =
  | { type: 'pr-comment'; data: PrConversationComment }
  | { type: 'review-header'; data: ReviewWithThreads }
  | { type: 'review-thread'; data: ReviewThread; parentReview: ReviewWithThreads }
  | { type: 'pending-reviewer'; data: string }

/**
 * A review with its code comment threads
 */
interface ReviewWithThreads {
  id: string
  author: string
  state: PrReview["state"]
  body?: string
  submittedAt?: string
  threads: ReviewThread[]
}

/**
 * A code comment thread (root comment with replies)
 */
interface ReviewThread {
  id: string
  filename: string
  line: number
  author: string
  body: string
  createdAt: string
  url?: string
  isResolved: boolean
  replies: Comment[]
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
 * Format a relative time string (compact, no "ago")
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
  if (diffDays < 30) return `${diffDays}d`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
  return `${Math.floor(diffDays / 365)}y`
}

/**
 * Format a date/time for commits
 */
function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    return `${diffDays}d ago`
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

/**
 * Get status color and label
 */
function getStatusInfo(state: PrInfo["state"], isDraft?: boolean): { label: string; color: string } {
  if (isDraft) {
    return { label: "Draft", color: theme.overlay1 }
  }
  switch (state) {
    case "open":
      return { label: "Open", color: theme.green }
    case "closed":
      return { label: "Closed", color: theme.red }
    case "merged":
      return { label: "Merged", color: theme.mauve }
  }
}

/**
 * Get review state icon and color
 */
function getReviewIcon(state: PrReview["state"]): { icon: string; color: string } {
  switch (state) {
    case "APPROVED":
      return { icon: "✓", color: theme.green }
    case "CHANGES_REQUESTED":
      return { icon: "✗", color: theme.red }
    case "COMMENTED":
      return { icon: "○", color: theme.subtext0 }
    case "PENDING":
      return { icon: "○", color: theme.yellow }
    case "DISMISSED":
      return { icon: "─", color: theme.overlay0 }
  }
}

/**
 * Build reviewer display for metadata section.
 * Shows each reviewer's most recent relevant review state.
 */
function buildReviewerSummary(reviews: PrReview[], requestedReviewers: string[]): { icon: string; name: string; color: string }[] {
  // Get the most recent meaningful review per author
  const reviewsByAuthor = new Map<string, PrReview>()
  
  // Sort reviews by date (most recent first)
  const sortedReviews = [...reviews].sort((a, b) => {
    const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
    const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
    return dateB - dateA
  })
  
  // Keep only the most recent review per author (excluding COMMENTED and DISMISSED)
  for (const review of sortedReviews) {
    if (reviewsByAuthor.has(review.author)) continue
    // Skip pure comment reviews - they don't represent a review decision
    if (review.state === "COMMENTED" || review.state === "DISMISSED") continue
    reviewsByAuthor.set(review.author, review)
  }
  
  const result: { icon: string; name: string; color: string }[] = []
  
  // Add reviewers with their status
  for (const [author, review] of reviewsByAuthor) {
    const { icon, color } = getReviewIcon(review.state)
    result.push({ icon, name: author, color })
  }
  
  // Add pending reviewers (requested but haven't reviewed yet)
  for (const reviewer of requestedReviewers) {
    if (!reviewsByAuthor.has(reviewer)) {
      result.push({ icon: "○", name: reviewer, color: theme.yellow })
    }
  }
  
  return result
}

/**
 * Get terminal width (defaults to 80 if unavailable)
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80
}

/**
 * Truncate string to max length with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + "…"
}

/**
 * Calculate available width for body text in conversation rows.
 * Total width minus fixed elements: indent, icons, author, time, padding
 */
function getBodyPreviewWidth(): number {
  const termWidth = getTerminalWidth()
  // Reserve space for: indent (4) + icon (2) + author (~20) + time (~12) + padding (~6)
  const reserved = 44
  return Math.max(20, termWidth - reserved)
}

/**
 * Calculate available width for thread rows (has file:line prefix).
 * Thread rows have: indent (4) + icon (2) + file:line (padded 24) + author (~15) + reply count (~6) + padding (~6)
 */
function getThreadBodyPreviewWidth(): number {
  const termWidth = getTerminalWidth()
  const reserved = 57
  return Math.max(15, termWidth - reserved)
}

/**
 * Calculate available width for file/commit lists.
 */
function getListItemWidth(): number {
  const termWidth = getTerminalWidth()
  // Reserve space for: indent (4) + icon (2) + status (~15) + padding (~6)
  const reserved = 27
  return Math.max(30, termWidth - reserved)
}

/**
 * Row references for selection updates
 */
interface ItemRowRefs {
  container: BoxRenderable
  primary: TextRenderable
  secondary?: TextRenderable
}

/**
 * Section configuration
 */
interface SectionConfig {
  id: PRInfoPanelSection
  title: string
  count: number
  preview: string
  hasItems: boolean
}

const ALL_SECTIONS: PRInfoPanelSection[] = ['description', 'conversation', 'files', 'commits']

/**
 * PR Info Panel - class-based for efficient updates
 */
export class PRInfoPanelClass {
  private renderer: CliRenderer
  private container: BoxRenderable
  private scrollBox: ScrollBoxRenderable
  private prInfo: PrInfo
  private files: DiffFile[]
  private comments: Comment[]
  
  // Section state
  private activeSection: PRInfoPanelSection = 'description'
  private cursorIndex: number = -1  // -1 = on section header
  
  // Expanded state per section (all open by default)
  private expandedSections: Set<PRInfoPanelSection> = new Set(ALL_SECTIONS)
  
  // Thread expanded state (by thread root comment id) - shows replies
  private expandedThreads: Set<string> = new Set()
  
  // Content expanded state (by item id) - shows full comment body
  private expandedContent: Set<string> = new Set()
  
  // Conversation items (computed from prInfo + comments)
  private conversationItems: ConversationItem[] = []
  
  // Flattened items cache (includes expanded review threads as separate items)
  private flatConversationItems: FlatConversationItem[] = []
  
  // Section containers (for rebuilding on section change)
  private sectionsContainer: BoxRenderable | null = null
  private sectionBoxes: BoxRenderable[] = []
  
  // Item row refs for cursor updates
  private itemRows: Map<PRInfoPanelSection, ItemRowRefs[]> = new Map()
  
  // Footer container for dynamic updates
  private footer: BoxRenderable | null = null

  constructor(renderer: CliRenderer, prInfo: PrInfo, files: DiffFile[] = [], comments: Comment[] = []) {
    this.renderer = renderer
    this.prInfo = prInfo
    this.files = files
    this.comments = comments
    
    // Build conversation items
    this.conversationItems = this.buildConversationItems()
    this.refreshFlatItems()
    
    // Build the panel
    const { container, scrollBox } = this.build()
    this.container = container
    this.scrollBox = scrollBox
  }

  /**
   * Get the container element
   */
  getContainer(): BoxRenderable {
    return this.container
  }

  /**
   * Get the scroll box for external scrolling
   */
  getScrollBox(): ScrollBoxRenderable {
    return this.scrollBox
  }

  /**
   * Get current active section
   */
  getActiveSection(): PRInfoPanelSection {
    return this.activeSection
  }

  /**
   * Get the current cursor index
   */
  getCursorIndex(): number {
    return this.cursorIndex
  }

  /**
   * Check if cursor is on section header (index -1)
   */
  isOnSectionHeader(): boolean {
    return this.cursorIndex === -1
  }

  /**
   * Get the item count for the current section (not including header)
   */
  private getItemCount(): number {
    switch (this.activeSection) {
      case 'description':
        return 0  // Description has no items, just expanded content
      case 'conversation':
        return this.flatConversationItems.length
      case 'files':
        return this.files.length
      case 'commits':
        return this.prInfo.commits?.length ?? 0
    }
  }

  /**
   * Get the max cursor index for the current section
   * -1 = section header, 0+ = items
   */
  getMaxCursorIndex(): number {
    const itemCount = this.getItemCount()
    return itemCount > 0 ? itemCount - 1 : -1
  }

  /**
   * Build conversation items from PR comments, reviews, and code comments
   */
  private buildConversationItems(): ConversationItem[] {
    const items: ConversationItem[] = []
    
    // Add PR conversation comments
    for (const comment of this.prInfo.conversationComments ?? []) {
      items.push({ type: 'pr-comment', data: comment })
    }
    
    // Build thread map from code comments (root comments only)
    const threadMap = new Map<string, ReviewThread>()
    for (const comment of this.comments) {
      if (comment.inReplyTo) continue // Skip replies
      
      const thread: ReviewThread = {
        id: comment.id,
        filename: comment.filename,
        line: comment.line,
        author: comment.author ?? 'you',
        body: comment.body,
        createdAt: comment.createdAt,
        url: comment.githubUrl,
        isResolved: comment.isThreadResolved ?? false,
        replies: [],
      }
      threadMap.set(comment.id, thread)
    }
    
    // Add replies to their parent threads
    for (const comment of this.comments) {
      if (comment.inReplyTo) {
        const parentThread = threadMap.get(comment.inReplyTo)
        if (parentThread) {
          parentThread.replies.push(comment)
        }
      }
    }
    
    // Sort replies within each thread
    for (const thread of threadMap.values()) {
      thread.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    }
    
    // Group threads by their parent review ID
    const reviewThreadsMap = new Map<number, ReviewThread[]>()
    const orphanThreads: ReviewThread[] = [] // Threads not linked to a review
    
    for (const comment of this.comments) {
      if (comment.inReplyTo) continue // Only process root comments
      const thread = threadMap.get(comment.id)
      if (!thread) continue
      
      if (comment.githubReviewId) {
        const existing = reviewThreadsMap.get(comment.githubReviewId) ?? []
        existing.push(thread)
        reviewThreadsMap.set(comment.githubReviewId, existing)
      } else {
        orphanThreads.push(thread)
      }
    }
    
    // Build reviews with their threads
    const reviews = this.prInfo.reviews ?? []
    for (const review of reviews) {
      if (review.state === "PENDING") continue // Skip pending reviews
      
      // Find threads for this review (match by numeric part of GraphQL ID)
      // GraphQL ID format: PRR_kwDOQMrSEM7rKlCy, REST API id is a number
      // We need to match somehow - for now just use the review data directly
      const reviewWithThreads: ReviewWithThreads = {
        id: review.id,
        author: review.author,
        state: review.state,
        body: review.body,
        submittedAt: review.submittedAt,
        threads: [], // Will be populated below
      }
      
      // Find threads that belong to this review
      // Match by looking at comments created around the same time
      // (This is imperfect but works for most cases)
      for (const [reviewId, threads] of reviewThreadsMap) {
        // The reviewId is the numeric REST API review ID
        // We can't directly match it to the GraphQL ID, so we add all threads
        // to the review they belong to based on the stored reviewId
        reviewWithThreads.threads.push(...threads)
        reviewThreadsMap.delete(reviewId) // Remove so we don't add twice
        break // For now, just assign threads to first review (imperfect)
      }
      
      items.push({ type: 'review', data: reviewWithThreads })
    }
    
    // Add orphan threads as standalone reviews (shouldn't happen normally)
    for (const thread of orphanThreads) {
      items.push({
        type: 'review',
        data: {
          id: `orphan-${thread.id}`,
          author: thread.author,
          state: "COMMENTED",
          threads: [thread],
        }
      })
    }
    
    // Add pending reviewers at the end
    const requestedReviewers = this.prInfo.requestedReviewers ?? []
    const submittedReviews = this.prInfo.reviews ?? []
    const pendingReviewers = requestedReviewers.filter(
      r => !submittedReviews.some(rev => rev.author === r)
    )
    for (const reviewer of pendingReviewers) {
      items.push({ type: 'pending-reviewer', data: reviewer })
    }
    
    // Sort items by date (pending reviewers go at the end since they have no date)
    items.sort((a, b) => {
      if (a.type === 'pending-reviewer') return 1
      if (b.type === 'pending-reviewer') return -1
      const dateA = a.type === 'pr-comment' 
        ? a.data.createdAt 
        : a.data.submittedAt ?? a.data.threads[0]?.createdAt ?? ''
      const dateB = b.type === 'pr-comment' 
        ? b.data.createdAt 
        : b.data.submittedAt ?? b.data.threads[0]?.createdAt ?? ''
      return new Date(dateA).getTime() - new Date(dateB).getTime()
    })
    
    return items
  }

  /**
   * Build flattened conversation items (expands reviews to include their threads)
   */
  private buildFlatConversationItems(): FlatConversationItem[] {
    const flat: FlatConversationItem[] = []
    
    for (const item of this.conversationItems) {
      if (item.type === 'pr-comment') {
        flat.push(item)
      } else if (item.type === 'pending-reviewer') {
        flat.push(item)
      } else {
        // Review - add header, then threads if expanded
        flat.push({ type: 'review-header', data: item.data })
        
        if (this.isContentExpanded(item)) {
          for (const thread of item.data.threads) {
            flat.push({ type: 'review-thread', data: thread, parentReview: item.data })
          }
        }
      }
    }
    
    return flat
  }

  /**
   * Refresh the flat conversation items cache
   */
  private refreshFlatItems(): void {
    this.flatConversationItems = this.buildFlatConversationItems()
  }

  /**
   * Move cursor within current section
   * Returns true if cursor moved, false if at boundary
   * Cursor -1 = section header, 0+ = items
   */
  moveCursor(delta: number): boolean {
    const maxIndex = this.getMaxCursorIndex()
    // Min is -1 (header), max is the last item index
    const newIndex = Math.max(-1, Math.min(maxIndex, this.cursorIndex + delta))
    
    if (newIndex === this.cursorIndex) return false
    
    // Update old row (deselect) - only for items, not header
    if (this.cursorIndex >= 0) {
      this.updateItemRow(this.activeSection, this.cursorIndex, false)
    }
    
    // Update new row (select) - only for items, not header
    this.cursorIndex = newIndex
    if (this.cursorIndex >= 0) {
      this.updateItemRow(this.activeSection, this.cursorIndex, true)
    }
    
    // Rebuild to update header highlight
    this.rebuildSections()
    return true
  }

  /**
   * Cycle to next/previous section (Tab navigation)
   * Positions cursor at section header (-1)
   */
  cycleSection(delta: number): void {
    const currentIndex = ALL_SECTIONS.indexOf(this.activeSection)
    const newIndex = (currentIndex + delta + ALL_SECTIONS.length) % ALL_SECTIONS.length
    
    this.setActiveSection(ALL_SECTIONS[newIndex]!)
  }

  /**
   * Cycle to next/previous section, positioning cursor at end if expanded
   * Used when navigating up from a section header
   */
  cycleSectionToEnd(delta: number): void {
    const currentIndex = ALL_SECTIONS.indexOf(this.activeSection)
    const newIndex = (currentIndex + delta + ALL_SECTIONS.length) % ALL_SECTIONS.length
    const newSection = ALL_SECTIONS[newIndex]!
    
    // Deselect old cursor
    if (this.cursorIndex >= 0) {
      this.updateItemRow(this.activeSection, this.cursorIndex, false)
    }
    
    this.activeSection = newSection
    
    // If new section is expanded, go to last item; otherwise stay on header
    if (this.expandedSections.has(newSection)) {
      const itemCount = this.getItemCountForSection(newSection)
      this.cursorIndex = itemCount > 0 ? itemCount - 1 : -1
      if (this.cursorIndex >= 0) {
        this.updateItemRow(newSection, this.cursorIndex, true)
      }
    } else {
      this.cursorIndex = -1
    }
    
    this.rebuildSections()
  }

  /**
   * Get item count for a specific section
   */
  private getItemCountForSection(section: PRInfoPanelSection): number {
    switch (section) {
      case 'description':
        return 0
      case 'conversation':
        return this.flatConversationItems.length
      case 'files':
        return this.files.length
      case 'commits':
        return this.prInfo.commits?.length ?? 0
    }
  }

  /**
   * Set the active section
   */
  setActiveSection(section: PRInfoPanelSection): void {
    if (section === this.activeSection) return
    
    // Deselect old section's cursor (only for items, not header)
    if (this.cursorIndex >= 0) {
      this.updateItemRow(this.activeSection, this.cursorIndex, false)
    }
    
    this.activeSection = section
    this.cursorIndex = -1  // Start on section header
    
    // Rebuild to update section header styling
    this.rebuildSections()
  }

  /**
   * Toggle expand/collapse for the active section (za)
   */
  toggleSection(): void {
    if (this.expandedSections.has(this.activeSection)) {
      this.expandedSections.delete(this.activeSection)
    } else {
      this.expandedSections.add(this.activeSection)
    }
    this.rebuildSections()
  }

  /**
   * Collapse the active section (zm)
   */
  collapseSection(): void {
    this.expandedSections.delete(this.activeSection)
    this.rebuildSections()
  }

  /**
   * Expand the active section (zr)
   */
  expandSection(): void {
    this.expandedSections.add(this.activeSection)
    this.rebuildSections()
  }

  /**
   * Collapse all sections (zM)
   */
  collapseAllSections(): void {
    this.expandedSections.clear()
    this.rebuildSections()
  }

  /**
   * Expand all sections (zR)
   */
  expandAllSections(): void {
    this.expandedSections = new Set(ALL_SECTIONS)
    this.rebuildSections()
  }

  /**
   * Check if active section is expanded
   */
  isSectionExpanded(): boolean {
    return this.expandedSections.has(this.activeSection)
  }

  /**
   * Get selected commit
   */
  getSelectedCommit(): PrCommit | undefined {
    if (this.activeSection !== 'commits' || this.cursorIndex < 0) return undefined
    return this.prInfo.commits?.[this.cursorIndex]
  }

  /**
   * Get selected file
   */
  getSelectedFile(): DiffFile | undefined {
    if (this.activeSection !== 'files' || this.cursorIndex < 0) return undefined
    return this.files[this.cursorIndex]
  }

  /**
   * Get selected conversation item (from original list, not flat)
   */
  getSelectedConversationItem(): ConversationItem | undefined {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return undefined
    
    // Map flat item back to original conversation item
    if (flatItem.type === 'pr-comment') {
      return flatItem
    } else if (flatItem.type === 'review-header') {
      return { type: 'review', data: flatItem.data }
    } else if (flatItem.type === 'review-thread') {
      return { type: 'review', data: flatItem.parentReview }
    } else {
      return flatItem
    }
  }

  /**
   * Get the jump location for the selected conversation item (file/line for code comments)
   */
  getSelectedCommentLocation(): { filename: string; line: number } | undefined {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return undefined
    
    if (flatItem.type === 'review-thread') {
      return { filename: flatItem.data.filename, line: flatItem.data.line }
    } else if (flatItem.type === 'review-header' && flatItem.data.threads.length > 0) {
      const firstThread = flatItem.data.threads[0]!
      return { filename: firstThread.filename, line: firstThread.line }
    }
    return undefined // PR comments have no code location
  }

  /**
   * Toggle expand/collapse for the selected conversation item.
   * - For PR comments: toggles full body display
   * - For reviews: toggles threads visibility (flattens them as navigable items)
   */
  toggleSelectedThread(): void {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return
    
    // For review threads, toggle the parent review
    if (flatItem.type === 'review-thread') {
      const parentId = flatItem.parentReview.id
      if (this.expandedContent.has(parentId)) {
        this.expandedContent.delete(parentId)
      } else {
        this.expandedContent.add(parentId)
      }
    } else {
      const itemId = this.getFlatItemId(flatItem)
      if (this.expandedContent.has(itemId)) {
        this.expandedContent.delete(itemId)
      } else {
        this.expandedContent.add(itemId)
      }
    }
    
    // Refresh flat items and rebuild
    this.refreshFlatItems()
    this.rebuildSections()
  }
  
  /**
   * Get the string id for a conversation item
   */
  private getItemId(item: ConversationItem): string {
    switch (item.type) {
      case 'pr-comment':
        return String(item.data.id)
      case 'review':
        return item.data.id
      case 'pending-reviewer':
        return `pending-${item.data}`
    }
  }
  
  /**
   * Get the string id for a flat conversation item
   */
  private getFlatItemId(item: FlatConversationItem): string {
    switch (item.type) {
      case 'pr-comment':
        return String(item.data.id)
      case 'review-header':
        return item.data.id
      case 'review-thread':
        return item.data.id
      case 'pending-reviewer':
        return `pending-${item.data}`
    }
  }
  
  /**
   * Get the currently selected flat conversation item
   */
  getSelectedFlatItem(): FlatConversationItem | undefined {
    if (this.activeSection !== 'conversation' || this.cursorIndex < 0) return undefined
    return this.flatConversationItems[this.cursorIndex]
  }
  
  /**
   * Check if an item's content is expanded (showing full body/threads)
   */
  private isContentExpanded(item: ConversationItem): boolean {
    return this.expandedContent.has(this.getItemId(item))
  }

  /**
   * Update a row's visual state
   */
  private updateItemRow(section: PRInfoPanelSection, index: number, selected: boolean): void {
    const rows = this.itemRows.get(section)
    const row = rows?.[index]
    if (!row) return

    row.container.backgroundColor = selected ? theme.surface1 : undefined
    
    // Update colors based on section type
    switch (section) {
      case 'commits':
        row.primary.fg = selected ? theme.peach : theme.yellow
        if (row.secondary) row.secondary.fg = selected ? theme.text : theme.subtext1
        break
      case 'files':
        row.primary.fg = selected ? theme.text : theme.subtext1
        break
      case 'conversation':
        row.primary.fg = selected ? theme.blue : theme.sapphire
        if (row.secondary) row.secondary.fg = selected ? theme.text : theme.subtext1
        break
    }
  }

  /**
   * Build section configs
   */
  private getSectionConfigs(): SectionConfig[] {
    const conversationCount = this.conversationItems.length
    const commitCount = this.prInfo.commits?.length ?? 0
    const fileCount = this.files.length
    const bodyLines = (this.prInfo.body || "").split("\n").filter(l => l.trim()).length

    return [
      {
        id: 'description',
        title: 'Description',
        count: bodyLines,
        preview: bodyLines > 0 ? `${bodyLines} lines` : "empty",
        hasItems: false,
      },
      {
        id: 'conversation',
        title: 'Conversation',
        count: conversationCount,
        preview: "",
        hasItems: conversationCount > 0,
      },
      {
        id: 'files',
        title: 'Files',
        count: fileCount,
        preview: `+${this.prInfo.additions} -${this.prInfo.deletions}`,
        hasItems: fileCount > 0,
      },
      {
        id: 'commits',
        title: 'Commits',
        count: commitCount,
        preview: "",
        hasItems: commitCount > 0,
      },
    ]
  }

  /**
   * Rebuild just the sections container
   */
  private rebuildSections(): void {
    if (!this.sectionsContainer) return
    
    // Remove existing section boxes
    for (const box of this.sectionBoxes) {
      this.sectionsContainer.remove(box.id)
    }
    this.sectionBoxes = []
    this.itemRows.clear()
    
    // Rebuild
    this.buildSections(this.sectionsContainer)
  }

  /**
   * Check if a section has selectable items
   */
  private sectionHasItems(section: PRInfoPanelSection): boolean {
    return section === 'files' || section === 'commits' || section === 'conversation'
  }

  /**
   * Build the sections content
   */
  private buildSections(container: BoxRenderable): void {
    const configs = this.getSectionConfigs()
    
    for (const config of configs) {
      const isActive = config.id === this.activeSection
      const isExpanded = this.expandedSections.has(config.id)
      const hasItems = this.sectionHasItems(config.id)
      
      // Header is highlighted when:
      // - Section is active AND cursor is on header (index -1)
      const headerHighlighted = isActive && this.cursorIndex === -1
      
      const sectionBox = new BoxRenderable(this.renderer, {
        id: `section-${config.id}`,
        flexDirection: "column",
        width: "100%",
        marginTop: 1,
      })
      this.sectionBoxes.push(sectionBox)
      
      // Section header
      const indicator = isExpanded ? "▼" : "▶"
      const headerRow = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        height: 1,
        backgroundColor: headerHighlighted ? theme.surface0 : undefined,
      })
      headerRow.add(new TextRenderable(this.renderer, {
        content: `${indicator}  ${config.title} (${config.count})`,
        fg: isActive ? theme.blue : theme.overlay0,
      }))
      // Show preview only when collapsed
      if (config.preview && !isExpanded) {
        headerRow.add(new TextRenderable(this.renderer, {
          content: `  ${config.preview}`,
          fg: theme.subtext0,
        }))
      }
      sectionBox.add(headerRow)
      
      // Section content (only if expanded)
      if (isExpanded) {
        this.buildSectionContent(sectionBox, config.id, isActive)
      }
      
      container.add(sectionBox)
    }
  }

  /**
   * Build content for a section
   */
  private buildSectionContent(container: BoxRenderable, section: PRInfoPanelSection, isActive: boolean): void {
    const contentBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      width: "100%",
      paddingLeft: 2,
      marginTop: 1,
    })
    
    switch (section) {
      case 'description':
        this.buildDescriptionContent(contentBox)
        break
      case 'conversation':
        this.buildConversationContent(contentBox, isActive)
        break
      case 'files':
        this.buildFilesContent(contentBox, isActive)
        break
      case 'commits':
        this.buildCommitsContent(contentBox, isActive)
        break
    }
    
    container.add(contentBox)
  }

  /**
   * Build full description content (markdown)
   */
  private buildDescriptionContent(container: BoxRenderable): void {
    if (!this.prInfo.body?.trim()) {
      container.add(new TextRenderable(this.renderer, {
        content: "No description provided",
        fg: theme.overlay0,
      }))
      return
    }
    
    const md = new MarkdownRenderable(this.renderer, {
      id: "pr-info-description",
      content: this.prInfo.body,
      syntaxStyle: getSyntaxStyle(),
    })
    container.add(md)
  }

  /**
   * Build conversation content using flattened items (reviews expand to show threads as separate items)
   */
  private buildConversationContent(container: BoxRenderable, isActive: boolean): void {
    const rows: ItemRowRefs[] = []
    
    // Refresh flat items before rendering
    this.refreshFlatItems()
    
    if (this.flatConversationItems.length === 0) {
      container.add(new TextRenderable(this.renderer, {
        content: "No comments",
        fg: theme.overlay0,
      }))
      return
    }
    
    for (let i = 0; i < this.flatConversationItems.length; i++) {
      const item = this.flatConversationItems[i]!
      const isSelected = isActive && i === this.cursorIndex
      
      if (item.type === 'pr-comment') {
        const comment = item.data
        const isExpanded = this.expandedContent.has(String(comment.id))
        
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })
        
        const expandIcon = isExpanded ? "▼" : "▶"
        row.add(new TextRenderable(this.renderer, { content: `${expandIcon} `, fg: theme.subtext0 }))
        row.add(new TextRenderable(this.renderer, { content: " PR  ", fg: theme.overlay1 }))
        
        const authorText = new TextRenderable(this.renderer, {
          content: `@${comment.author}`,
          fg: isSelected ? theme.blue : theme.sapphire,
        })
        row.add(authorText)
        
        let bodyText: TextRenderable
        if (isExpanded) {
          bodyText = new TextRenderable(this.renderer, { content: "", fg: theme.subtext1 })
        } else {
          const bodyPreview = truncate(comment.body.replace(/\n/g, " "), getBodyPreviewWidth())
          bodyText = new TextRenderable(this.renderer, {
            content: `  ${bodyPreview}`,
            fg: isSelected ? theme.text : theme.subtext1,
          })
        }
        row.add(bodyText)
        
        row.add(new TextRenderable(this.renderer, {
          content: `  ${formatTimeAgo(comment.createdAt)}`,
          fg: theme.overlay0,
        }))
        
        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
        if (isExpanded) {
          this.buildExpandedCommentBody(container, comment.body, 4)
        }
        
      } else if (item.type === 'review-header') {
        const review = item.data
        const isExpanded = this.expandedContent.has(review.id)
        const hasThreads = review.threads.length > 0
        const hasBody = review.body && review.body.trim().length > 0
        const { icon: stateIcon, color: stateColor } = getReviewIcon(review.state)
        
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })
        
        const expandIcon = isExpanded ? "▼" : "▶"
        row.add(new TextRenderable(this.renderer, { content: `${expandIcon} `, fg: theme.subtext0 }))
        row.add(new TextRenderable(this.renderer, { content: ` ${stateIcon} `, fg: stateColor }))
        
        const authorText = new TextRenderable(this.renderer, {
          content: `@${review.author}`,
          fg: isSelected ? theme.blue : theme.sapphire,
        })
        row.add(authorText)
        
        const stateLabel = review.state === "CHANGES_REQUESTED" 
          ? "requested changes" 
          : review.state === "APPROVED" 
            ? "approved" 
            : "commented"
        row.add(new TextRenderable(this.renderer, {
          content: `  ${stateLabel}`,
          fg: theme.subtext0,
        }))
        
        let bodyText: TextRenderable
        if (!isExpanded && hasThreads) {
          bodyText = new TextRenderable(this.renderer, {
            content: `  (${review.threads.length} ${review.threads.length === 1 ? 'thread' : 'threads'})`,
            fg: theme.overlay0,
          })
        } else {
          bodyText = new TextRenderable(this.renderer, { content: "", fg: theme.subtext1 })
        }
        row.add(bodyText)
        
        if (review.submittedAt) {
          row.add(new TextRenderable(this.renderer, {
            content: `  ${formatTimeAgo(review.submittedAt)}`,
            fg: theme.overlay0,
          }))
        }
        
        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
        // Show review body if expanded (but threads are separate items now)
        if (isExpanded && hasBody) {
          this.buildExpandedCommentBody(container, review.body!, 4)
        }
        
      } else if (item.type === 'review-thread') {
        const thread = item.data
        const isExpanded = this.expandedContent.has(thread.id)
        const hasReplies = thread.replies.length > 0
        
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          paddingLeft: 2,  // Indent to show it's under a review
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })
        
        // Thread icon
        const icon = thread.isResolved ? "✓" : (isExpanded ? "▼" : "▶")
        const iconColor = thread.isResolved ? theme.green : theme.subtext0
        row.add(new TextRenderable(this.renderer, { content: `${icon} `, fg: iconColor }))
        
        // File:line - use more width on wider terminals
        const fileLineWidth = Math.min(40, Math.max(20, Math.floor(getTerminalWidth() * 0.25)))
        const fileShort = truncate(thread.filename.split('/').pop() || thread.filename, fileLineWidth - 5) // Leave room for :line
        row.add(new TextRenderable(this.renderer, {
          content: ` ${fileShort}:${thread.line}  `,
          fg: theme.yellow,
        }))
        
        const authorText = new TextRenderable(this.renderer, {
          content: `@${thread.author}`,
          fg: isSelected ? theme.blue : theme.sapphire,
        })
        row.add(authorText)
        
        let bodyText: TextRenderable
        if (isExpanded) {
          bodyText = new TextRenderable(this.renderer, { content: "", fg: theme.subtext1 })
        } else {
          const bodyPreview = truncate(thread.body.replace(/\n/g, " "), getThreadBodyPreviewWidth())
          bodyText = new TextRenderable(this.renderer, {
            content: `  ${bodyPreview}`,
            fg: isSelected ? theme.text : theme.subtext1,
          })
        }
        row.add(bodyText)
        
        if (hasReplies && !isExpanded) {
          row.add(new TextRenderable(this.renderer, {
            content: `  (${thread.replies.length + 1})`,
            fg: theme.overlay0,
          }))
        }
        
        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
        // Show thread content if expanded
        if (isExpanded) {
          this.buildExpandedCommentBody(container, thread.body, 6)
          
          for (const reply of thread.replies) {
            const replyHeader = new BoxRenderable(this.renderer, {
              flexDirection: "row",
              height: 1,
              paddingLeft: 6,
            })
            replyHeader.add(new TextRenderable(this.renderer, { content: "└ ", fg: theme.surface2 }))
            replyHeader.add(new TextRenderable(this.renderer, {
              content: `@${reply.author ?? 'you'}`,
              fg: theme.sapphire,
            }))
            replyHeader.add(new TextRenderable(this.renderer, {
              content: `  ${formatTimeAgo(reply.createdAt)}`,
              fg: theme.overlay0,
            }))
            container.add(replyHeader)
            
            this.buildExpandedCommentBody(container, reply.body, 8)
          }
        }
        
      } else {
        // Pending reviewer
        const reviewer = item.data
        
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })
        
        row.add(new TextRenderable(this.renderer, { content: "  ", fg: theme.subtext0 }))
        row.add(new TextRenderable(this.renderer, { content: "○ ", fg: theme.yellow }))
        
        const authorText = new TextRenderable(this.renderer, {
          content: `@${reviewer}`,
          fg: isSelected ? theme.blue : theme.sapphire,
        })
        row.add(authorText)
        
        const bodyText = new TextRenderable(this.renderer, {
          content: "  awaiting review",
          fg: theme.yellow,
        })
        row.add(bodyText)
        
        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
      }
    }
    
    this.itemRows.set('conversation', rows)
  }
  
  /**
   * Build expanded comment body with markdown rendering
   */
  private buildExpandedCommentBody(container: BoxRenderable, body: string, indent: number): void {
    const bodyBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      paddingLeft: indent,
      paddingRight: 2,
      marginTop: 1,
      marginBottom: 1,
    })
    
    const md = new MarkdownRenderable(this.renderer, {
      content: body,
      syntaxStyle: getSyntaxStyle(),
    })
    bodyBox.add(md)
    
    container.add(bodyBox)
  }

  /**
   * Build a code comment thread display (file:line, body, replies)
   */
  private buildThreadDisplay(container: BoxRenderable, thread: ReviewThread, indent: number): void {
    // Thread header with file:line
    const headerRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 1,
      paddingLeft: indent,
      marginTop: 1,
    })
    
    // Resolved indicator
    const icon = thread.isResolved ? "✓" : "○"
    const iconColor = thread.isResolved ? theme.green : theme.subtext0
    headerRow.add(new TextRenderable(this.renderer, { content: `${icon} `, fg: iconColor }))
    
    // File:line
    const fileShort = truncate(thread.filename.split('/').pop() || thread.filename, 30)
    headerRow.add(new TextRenderable(this.renderer, {
      content: `${fileShort}:${thread.line}`,
      fg: theme.yellow,
    }))
    
    container.add(headerRow)
    
    // Thread root comment body
    this.buildExpandedCommentBody(container, thread.body, indent + 2)
    
    // Replies
    for (const reply of thread.replies) {
      const replyHeader = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        height: 1,
        paddingLeft: indent + 2,
      })
      replyHeader.add(new TextRenderable(this.renderer, { content: "└ ", fg: theme.surface2 }))
      replyHeader.add(new TextRenderable(this.renderer, {
        content: `@${reply.author ?? 'you'}`,
        fg: theme.sapphire,
      }))
      replyHeader.add(new TextRenderable(this.renderer, {
        content: `  ${formatTimeAgo(reply.createdAt)}`,
        fg: theme.overlay0,
      }))
      container.add(replyHeader)
      
      this.buildExpandedCommentBody(container, reply.body, indent + 4)
    }
  }

  /**
   * Build files content
   */
  private buildFilesContent(container: BoxRenderable, isActive: boolean): void {
    const rows: ItemRowRefs[] = []
    
    if (this.files.length === 0) {
      container.add(new TextRenderable(this.renderer, {
        content: "No files changed",
        fg: theme.overlay0,
      }))
      return
    }
    
    for (let i = 0; i < this.files.length; i++) {
      const file = this.files[i]!
      const isSelected = isActive && i === this.cursorIndex
      
      const row = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        height: 1,
        backgroundColor: isSelected ? theme.surface1 : undefined,
      })
      
      const filenameText = new TextRenderable(this.renderer, {
        content: truncate(file.filename, getListItemWidth()),
        fg: isSelected ? theme.text : theme.subtext1,
      })
      row.add(filenameText)
      
      row.add(new TextRenderable(this.renderer, {
        content: `+${file.additions}`.padStart(6),
        fg: theme.green,
      }))
      row.add(new TextRenderable(this.renderer, {
        content: `-${file.deletions}`.padStart(6),
        fg: theme.red,
      }))
      
      container.add(row)
      rows.push({ container: row, primary: filenameText })
    }
    
    this.itemRows.set('files', rows)
  }

  /**
   * Build commits content
   */
  private buildCommitsContent(container: BoxRenderable, isActive: boolean): void {
    const commits = this.prInfo.commits ?? []
    const rows: ItemRowRefs[] = []
    
    if (commits.length === 0) {
      container.add(new TextRenderable(this.renderer, {
        content: "No commits",
        fg: theme.overlay0,
      }))
      return
    }
    
    const maxDisplay = 20
    // Calculate message width: terminal - timeAgo(8) - sha(8) - padding(4)
    const termWidth = getTerminalWidth()
    const messageWidth = Math.max(20, termWidth - 8 - 8 - 4)
    
    for (let i = 0; i < Math.min(maxDisplay, commits.length); i++) {
      const commit = commits[i]!
      const isSelected = isActive && i === this.cursorIndex
      
      const row = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        height: 1,
        backgroundColor: isSelected ? theme.surface1 : undefined,
      })
      
      // Relative date (right-padded to 8 chars for alignment)
      row.add(new TextRenderable(this.renderer, {
        content: formatTimeAgo(commit.date).padEnd(8),
        fg: theme.subtext0,
      }))
      
      // SHA (7 chars + 1 space)
      const shaText = new TextRenderable(this.renderer, {
        content: commit.sha.slice(0, 7) + " ",
        fg: isSelected ? theme.peach : theme.yellow,
      })
      row.add(shaText)
      
      // Message (truncated)
      const messageText = new TextRenderable(this.renderer, {
        content: truncate(commit.message, messageWidth),
        fg: isSelected ? theme.text : theme.subtext1,
      })
      row.add(messageText)
      
      container.add(row)
      rows.push({ container: row, primary: shaText, secondary: messageText })
    }
    
    if (commits.length > maxDisplay) {
      container.add(new TextRenderable(this.renderer, {
        content: `... +${commits.length - maxDisplay} more`,
        fg: theme.overlay0,
      }))
    }
    
    this.itemRows.set('commits', rows)
  }

  /**
   * Build the panel
   */
  private build(): { container: BoxRenderable; scrollBox: ScrollBoxRenderable } {
    const prInfo = this.prInfo
    const statusInfo = getStatusInfo(prInfo.state, prInfo.isDraft)

    // Main container
    const container = new BoxRenderable(this.renderer, {
      id: "pr-info-panel",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: theme.base,
    })

    // Header
    const header = new BoxRenderable(this.renderer, {
      height: 1,
      width: "100%",
      backgroundColor: theme.mantle,
      paddingLeft: 1,
      flexDirection: "row",
      justifyContent: "space-between",
    })
    header.add(new TextRenderable(this.renderer, { content: "PR Info", fg: colors.primary }))
    header.add(new TextRenderable(this.renderer, { content: "Esc to close ", fg: theme.overlay0 }))
    container.add(header)

    // Scroll box
    const scrollBox = new ScrollBoxRenderable(this.renderer, {
      id: "pr-info-scroll",
      flexGrow: 1,
      width: "100%",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      scrollY: true,
    })
    container.add(scrollBox)

    // Content container inside scroll box
    const content = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      width: "100%",
    })
    scrollBox.add(content)

    // Title
    content.add(new TextRenderable(this.renderer, { content: prInfo.title, fg: colors.text }))

    // Separator
    const separator = new BoxRenderable(this.renderer, { height: 1, width: "100%", marginTop: 1 })
    separator.add(new TextRenderable(this.renderer, { content: "─".repeat(70), fg: theme.surface1 }))
    content.add(separator)

    // Basic info section (always visible) - single column layout
    const basicInfo = new BoxRenderable(this.renderer, { flexDirection: "column", width: "100%", marginTop: 1 })
    content.add(basicInfo)

    // Status row
    const statusRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    statusRow.add(new TextRenderable(this.renderer, { content: "Status".padEnd(12), fg: theme.overlay0 }))
    statusRow.add(new TextRenderable(this.renderer, { content: statusInfo.label, fg: statusInfo.color }))
    basicInfo.add(statusRow)

    // Author row
    const authorRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    authorRow.add(new TextRenderable(this.renderer, { content: "Author".padEnd(12), fg: theme.overlay0 }))
    authorRow.add(new TextRenderable(this.renderer, { content: `@${prInfo.author}`, fg: theme.blue }))
    basicInfo.add(authorRow)

    // Branch row
    const branchRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    branchRow.add(new TextRenderable(this.renderer, { content: "Branch".padEnd(12), fg: theme.overlay0 }))
    branchRow.add(new TextRenderable(this.renderer, { content: `${prInfo.headRef} → ${prInfo.baseRef}`, fg: theme.text }))
    basicInfo.add(branchRow)

    // Changes row
    const changesRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    changesRow.add(new TextRenderable(this.renderer, { content: "Changes".padEnd(12), fg: theme.overlay0 }))
    changesRow.add(new TextRenderable(this.renderer, { content: `+${prInfo.additions}`, fg: theme.green }))
    changesRow.add(new TextRenderable(this.renderer, { content: ` -${prInfo.deletions}`, fg: theme.red }))
    changesRow.add(new TextRenderable(this.renderer, { content: ` (${prInfo.changedFiles} files)`, fg: theme.subtext0 }))
    basicInfo.add(changesRow)

    // Reviews row (if there are any reviews or requested reviewers)
    const reviewerSummary = buildReviewerSummary(prInfo.reviews ?? [], prInfo.requestedReviewers ?? [])
    if (reviewerSummary.length > 0) {
      const reviewsRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
      reviewsRow.add(new TextRenderable(this.renderer, { content: "Reviews".padEnd(12), fg: theme.overlay0 }))
      for (const reviewer of reviewerSummary) {
        reviewsRow.add(new TextRenderable(this.renderer, { content: `${reviewer.icon} ${reviewer.name}  `, fg: reviewer.color }))
      }
      basicInfo.add(reviewsRow)
    }

    // Separator before sections
    const separator2 = new BoxRenderable(this.renderer, { height: 1, width: "100%", marginTop: 1 })
    separator2.add(new TextRenderable(this.renderer, { content: "─".repeat(70), fg: theme.surface1 }))
    content.add(separator2)

    // Sections container
    this.sectionsContainer = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      width: "100%",
    })
    content.add(this.sectionsContainer)
    
    // Build sections
    this.buildSections(this.sectionsContainer)

    // Footer
    this.footer = new BoxRenderable(this.renderer, {
      height: 1,
      width: "100%",
      backgroundColor: theme.mantle,
      paddingLeft: 2,
      flexDirection: "row",
    })
    this.buildFooterContent()
    container.add(this.footer)

    return { container, scrollBox }
  }

  /**
   * Build footer content with keybinding hints
   */
  private buildFooterContent(): void {
    if (!this.footer) return
    
    this.footer.add(new TextRenderable(this.renderer, { content: "Tab ", fg: theme.yellow }))
    this.footer.add(new TextRenderable(this.renderer, { content: "section  ", fg: theme.subtext0 }))
    this.footer.add(new TextRenderable(this.renderer, { content: "j/k ", fg: theme.yellow }))
    this.footer.add(new TextRenderable(this.renderer, { content: "nav  ", fg: theme.subtext0 }))
    this.footer.add(new TextRenderable(this.renderer, { content: "za ", fg: theme.yellow }))
    this.footer.add(new TextRenderable(this.renderer, { content: "toggle  ", fg: theme.subtext0 }))
    this.footer.add(new TextRenderable(this.renderer, { content: "Enter ", fg: theme.yellow }))
    this.footer.add(new TextRenderable(this.renderer, { content: "action  ", fg: theme.subtext0 }))
    this.footer.add(new TextRenderable(this.renderer, { content: "y ", fg: theme.yellow }))
    this.footer.add(new TextRenderable(this.renderer, { content: "copy  ", fg: theme.subtext0 }))
    this.footer.add(new TextRenderable(this.renderer, { content: "o ", fg: theme.yellow }))
    this.footer.add(new TextRenderable(this.renderer, { content: "open", fg: theme.subtext0 }))
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    if (this.container.parent) {
      this.container.parent.remove(this.container.id)
    }
  }
}
