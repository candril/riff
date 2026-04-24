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
import type { PrInfo, PrReview, PrCommit, PrConversationComment, PrCheck, PrCheckAnnotation } from "../providers/github"
import { getPrCheckAnnotations } from "../providers/github"
import type { DiffFile } from "../utils/diff-parser"
import type { Comment, ReactionSummary, ReactionTarget } from "../types"
import { REACTION_META } from "../types"
import type { PRInfoPanelSection } from "../state"
import { colors, theme } from "../theme"

/**
 * Unified conversation item for display
 */
type ConversationItem = 
  | { type: 'pr-comment'; data: PrConversationComment }
  | { type: 'review'; data: ReviewWithThreads }
  | { type: 'pending-reviewer'; data: string[] }

/**
 * Flattened conversation item (for navigation when reviews are expanded)
 */
type FlatConversationItem =
  | { type: 'pr-comment'; data: PrConversationComment }
  | { type: 'review-header'; data: ReviewWithThreads }
  | { type: 'review-thread'; data: ReviewThread; parentReview: ReviewWithThreads }
  | { type: 'pending-reviewer'; data: string[] }

/**
 * Flattened check item (spec 043). Mirrors how the conversation section
 * flattens reviews+threads for single-axis cursor nav.
 */
type FlatCheckItem =
  | { kind: 'check'; check: PrCheck }
  | { kind: 'annotation'; check: PrCheck; annotation: PrCheckAnnotation }
  | { kind: 'placeholder'; check: PrCheck; placeholder: 'loading' | 'empty' | 'error' }

/**
 * A review with its code comment threads
 */
interface ReviewWithThreads {
  id: string
  /** Numeric REST id — needed to build a `{kind:"review"}` reaction target (spec 042) */
  databaseId?: number
  author: string
  state: PrReview["state"]
  body?: string
  submittedAt?: string
  threads: ReviewThread[]
  reactions?: ReactionSummary[]
}

/**
 * A code comment thread (root comment with replies)
 */
interface ReviewThread {
  id: string
  /** Root comment's numeric GitHub id — needed to build a
   *  `{kind:"review-comment"}` reaction target (spec 042). Undefined for
   *  local (not-yet-synced) threads. */
  githubId?: number
  filename: string
  line: number
  author: string
  body: string
  createdAt: string
  url?: string
  isResolved: boolean
  diffHunk?: string
  replies: Comment[]
  reactions?: ReactionSummary[]
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
function buildReviewerSummary(reviews: PrReview[], _requestedReviewers: string[]): { icon: string; name: string; color: string }[] {
  // Show only reviewers who actually submitted a review. Pending/
  // requested reviewers are already visible in the Conversation section
  // and just duplicate noise in this header. Includes COMMENTED so
  // anyone who engaged shows up, even without an approve/reject call.
  const reviewsByAuthor = new Map<string, PrReview>()

  const sortedReviews = [...reviews].sort((a, b) => {
    const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
    const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
    return dateB - dateA
  })

  for (const review of sortedReviews) {
    if (reviewsByAuthor.has(review.author)) continue
    if (review.state === "DISMISSED" || review.state === "PENDING") continue
    reviewsByAuthor.set(review.author, review)
  }

  const result: { icon: string; name: string; color: string }[] = []
  for (const [author, review] of reviewsByAuthor) {
    const { icon, color } = getReviewIcon(review.state)
    result.push({ icon, name: author, color })
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
 * Clean up a comment body for single-line preview display.
 * Strips HTML comments, markdown noise, collapses whitespace.
 */
function cleanBodyPreview(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")      // Remove HTML comments
    .replace(/<[^>]+>/g, "")               // Remove HTML tags
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/^#{1,6}\s+/gm, "")           // Remove heading markers
    .replace(/\|[^|\n]*\|/g, "")           // Remove markdown table rows
    .replace(/[:\-|]{3,}/g, "")            // Remove table separators
    .replace(/^\s*[-*+]\s+/gm, "")         // Remove list markers
    .replace(/`{1,3}/g, "")               // Remove backticks
    .replace(/\n/g, " ")                   // Collapse newlines to spaces
    .replace(/\s+/g, " ")                  // Collapse multiple spaces
    .trim()
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

const ALL_SECTIONS: PRInfoPanelSection[] = ['description', 'checks', 'conversation', 'files', 'commits']

/**
 * A check is "failing" in the sense that expanding it to view annotations
 * makes sense (spec 043). `neutral` and `skipped` don't qualify even
 * though they're technically non-success.
 */
function isFailingCheck(check: PrCheck): boolean {
  if (check.status !== "completed") return false
  return (
    check.conclusion === "failure" ||
    check.conclusion === "timed_out" ||
    check.conclusion === "action_required"
  )
}

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
  
  // Expanded state per section (checks collapsed by default, others open)
  private expandedSections: Set<PRInfoPanelSection> = new Set(['description', 'conversation', 'files', 'commits'] as PRInfoPanelSection[])
  
  // Thread expanded state (by thread root comment id) - shows replies
  private expandedThreads: Set<string> = new Set()
  
  // Content expanded state (by item id) - shows full comment body
  private expandedContent: Set<string> = new Set()
  
  // Conversation items (computed from prInfo + comments)
  private conversationItems: ConversationItem[] = []
  
  // Flattened items cache (includes expanded review threads as separate items)
  private flatConversationItems: FlatConversationItem[] = []

  // Checks expand state (spec 043) — per-session only, not persisted.
  private expandedCheckIds: Set<number> = new Set()
  private flatCheckItems: FlatCheckItem[] = []
  // Signals a re-render to the outer app (set by app.ts).
  private onExternalRerender: (() => void) | null = null
  
  // Section containers (for rebuilding on section change)
  private sectionsContainer: BoxRenderable | null = null
  private sectionBoxes: BoxRenderable[] = []
  
  // Item row refs for cursor updates
  private itemRows: Map<PRInfoPanelSection, ItemRowRefs[]> = new Map()
  
  // Footer container for dynamic updates
  private footer: BoxRenderable | null = null
  
  // Comment input overlay
  private commentInputOverlay: BoxRenderable | null = null
  private commentInputText: TextRenderable | null = null
  private commentInputStatus: TextRenderable | null = null

  constructor(renderer: CliRenderer, prInfo: PrInfo, files: DiffFile[] = [], comments: Comment[] = []) {
    this.renderer = renderer
    this.prInfo = prInfo
    this.files = files
    this.comments = comments
    
    // Build conversation items
    this.conversationItems = this.buildConversationItems()
    this.refreshFlatItems()
    this.refreshFlatCheckItems()
    
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
   * Derive the reaction target for the currently-focused item (spec 042).
   * Returns null for sections/items that don't carry reactions (checks,
   * files, commits, pending-reviewer).
   *
   * - Description section → the PR body.
   * - Conversation section:
   *   - pr-comment → the issue comment.
   *   - review-header → the review summary (requires databaseId).
   *   - review-thread → the root inline comment (requires githubId).
   */
  getReactionTarget(): ReactionTarget | null {
    if (this.activeSection === 'description') {
      return { kind: "issue", prNumber: this.prInfo.number }
    }
    if (this.activeSection !== 'conversation') return null
    const flat = this.getSelectedFlatItem()
    if (!flat) return null
    switch (flat.type) {
      case 'pr-comment':
        return { kind: "issue-comment", githubId: flat.data.id }
      case 'review-header':
        return flat.data.databaseId !== undefined
          ? { kind: "review", reviewId: flat.data.databaseId, prNumber: this.prInfo.number }
          : null
      case 'review-thread':
        return flat.data.githubId !== undefined
          ? { kind: "review-comment", githubId: flat.data.githubId }
          : null
      case 'pending-reviewer':
        return null
    }
  }

  /**
   * Get the item count for the current section (not including header)
   */
  private getItemCount(): number {
    switch (this.activeSection) {
      case 'description':
        return 0  // Description has no items, just expanded content
      case 'checks':
        return this.flatCheckItems.length
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
        githubId: comment.githubId,
        filename: comment.filename,
        line: comment.line,
        author: comment.author ?? 'you',
        body: comment.body,
        createdAt: comment.createdAt,
        url: comment.githubUrl,
        isResolved: comment.isThreadResolved ?? false,
        diffHunk: comment.diffHunk,
        replies: [],
        reactions: comment.reactions,
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
      
      const reviewWithThreads: ReviewWithThreads = {
        id: review.id,
        databaseId: review.databaseId,
        author: review.author,
        state: review.state,
        body: review.body,
        submittedAt: review.submittedAt,
        threads: [], // Will be populated below
        reactions: review.reactions,
      }
      
      // Find threads that belong to this review
      // Match using databaseId (numeric REST API ID) which matches comment.githubReviewId
      if (review.databaseId) {
        const threads = reviewThreadsMap.get(review.databaseId)
        if (threads) {
          reviewWithThreads.threads.push(...threads)
          reviewThreadsMap.delete(review.databaseId)
        }
      }
      
      // Skip empty COMMENTED reviews (auto-generated when posting inline comments without a body)
      if (review.state === "COMMENTED" && !review.body && reviewWithThreads.threads.length === 0) {
        continue
      }
      
      items.push({ type: 'review', data: reviewWithThreads })
    }
    
    // Add unmatched threads from reviewThreadsMap (review ID didn't match any known review)
    for (const [, threads] of reviewThreadsMap) {
      orphanThreads.push(...threads)
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
    
    // Collapse all pending reviewers into a single item at the end.
    // Listing each as its own row bloats the section (spec 041 polish).
    const requestedReviewers = this.prInfo.requestedReviewers ?? []
    const submittedReviews = this.prInfo.reviews ?? []
    const pendingReviewers = requestedReviewers.filter(
      r => !submittedReviews.some(rev => rev.author === r)
    )
    if (pendingReviewers.length > 0) {
      items.push({ type: 'pending-reviewer', data: pendingReviewers })
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
   * Rebuild flat check items list — checks + any inline annotation /
   * placeholder rows for currently-expanded failing checks (spec 043).
   */
  private refreshFlatCheckItems(): void {
    const flat: FlatCheckItem[] = []
    const checks = this.prInfo.checks ?? []
    for (const check of checks) {
      flat.push({ kind: 'check', check })
      if (!this.expandedCheckIds.has(check.id)) continue
      if (!isFailingCheck(check)) continue

      const status = check.annotationsStatus ?? 'idle'
      if (status === 'loading') {
        flat.push({ kind: 'placeholder', check, placeholder: 'loading' })
      } else if (status === 'error') {
        flat.push({ kind: 'placeholder', check, placeholder: 'error' })
      } else if (check.annotations && check.annotations.length > 0) {
        for (const annotation of check.annotations) {
          flat.push({ kind: 'annotation', check, annotation })
        }
      } else if (status === 'loaded') {
        flat.push({ kind: 'placeholder', check, placeholder: 'empty' })
      }
    }
    this.flatCheckItems = flat
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
      case 'checks':
        return this.flatCheckItems.length
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
   * Get selected check
   */
  getSelectedCheck(): PrCheck | undefined {
    if (this.activeSection !== 'checks' || this.cursorIndex < 0) return undefined
    return this.flatCheckItems[this.cursorIndex]?.check
  }

  /**
   * When the cursor is on an annotation row, return that annotation and
   * its parent check. `null` when the cursor is elsewhere (including on
   * a check row itself) (spec 043).
   */
  getSelectedAnnotation(): { check: PrCheck; annotation: PrCheckAnnotation } | null {
    if (this.activeSection !== 'checks' || this.cursorIndex < 0) return null
    const item = this.flatCheckItems[this.cursorIndex]
    if (!item || item.kind !== 'annotation') return null
    return { check: item.check, annotation: item.annotation }
  }

  /**
   * Toggle expansion of a failing check. Kicks off an annotations fetch
   * on first expand (spec 043).
   */
  toggleCheckExpansion(checkId: number): void {
    if (this.expandedCheckIds.has(checkId)) {
      this.expandedCheckIds.delete(checkId)
    } else {
      this.expandedCheckIds.add(checkId)
      const check = this.prInfo.checks?.find(c => c.id === checkId)
      if (check && !check.annotationsStatus && isFailingCheck(check)) {
        void this.fetchAnnotationsFor(check)
      }
    }
    this.refreshFlatCheckItems()
    this.rebuildSections()
  }

  /**
   * Expand the currently-selected check row (no-op on annotation rows
   * or already-expanded / non-failing checks). Used by `l` in the
   * checks section, mirroring conversation (spec 043).
   */
  expandSelectedCheck(): void {
    const check = this.getSelectedCheckRow()
    if (!check || !isFailingCheck(check)) return
    if (this.expandedCheckIds.has(check.id)) return
    this.toggleCheckExpansion(check.id)
  }

  /**
   * Collapse the currently-selected check row. If the cursor is on one
   * of that check's annotation rows, collapse its parent check and move
   * the cursor back onto the check row (spec 043).
   */
  collapseSelectedCheck(): void {
    if (this.activeSection !== 'checks' || this.cursorIndex < 0) return
    const item = this.flatCheckItems[this.cursorIndex]
    if (!item) return
    const check = item.check
    if (!this.expandedCheckIds.has(check.id)) return

    const parentIndex = this.flatCheckItems.findIndex(
      i => i.kind === 'check' && i.check.id === check.id,
    )
    this.toggleCheckExpansion(check.id)
    if (parentIndex >= 0 && this.cursorIndex !== parentIndex) {
      this.updateItemRow(this.activeSection, this.cursorIndex, false)
      this.cursorIndex = parentIndex
      this.updateItemRow(this.activeSection, this.cursorIndex, true)
      this.rebuildSections()
    }
  }

  /**
   * Like `getSelectedCheck`, but returns the check *only* when the
   * cursor is actually on the check's row (not on one of its
   * annotations). Used by the expand/collapse keys so e.g. pressing
   * `l` on a deep annotation row doesn't re-expand the parent.
   */
  private getSelectedCheckRow(): PrCheck | undefined {
    if (this.activeSection !== 'checks' || this.cursorIndex < 0) return undefined
    const item = this.flatCheckItems[this.cursorIndex]
    if (!item || item.kind !== 'check') return undefined
    return item.check
  }

  /**
   * Lazy fetch of annotations for a single check. Mutates the check in
   * place (session-local state — app state does not carry annotations).
   * Rebuilds the panel on transitions so the user sees
   * loading → loaded/empty/error (spec 043).
   */
  private async fetchAnnotationsFor(check: PrCheck): Promise<void> {
    check.annotationsStatus = "loading"
    this.refreshFlatCheckItems()
    this.rebuildSections()
    this.onExternalRerender?.()
    try {
      const annotations = await getPrCheckAnnotations(
        this.prInfo.owner,
        this.prInfo.repo,
        check.id,
      )
      check.annotations = annotations
      check.annotationsStatus = "loaded"
    } catch {
      check.annotationsStatus = "error"
    }
    this.refreshFlatCheckItems()
    this.rebuildSections()
    this.onExternalRerender?.()
  }

  /**
   * Allow the outer app to register a callback so async state transitions
   * inside the panel (annotation fetches) trigger a full app re-render.
   */
  setOnExternalRerender(cb: (() => void) | null): void {
    this.onExternalRerender = cb
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
    
    const itemId = this.getFlatItemId(flatItem)
    if (this.expandedContent.has(itemId)) {
      this.expandedContent.delete(itemId)
    } else {
      this.expandedContent.add(itemId)
    }
    
    // Refresh flat items and rebuild
    this.refreshFlatItems()
    this.rebuildSections()
  }

  /**
   * Expand the currently selected conversation item (no-op if already expanded)
   */
  expandSelectedThread(): void {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return
    const itemId = this.getFlatItemId(flatItem)
    if (!this.expandedContent.has(itemId)) {
      this.expandedContent.add(itemId)
      this.refreshFlatItems()
      this.rebuildSections()
    }
  }

  /**
   * Collapse the currently selected conversation item (no-op if already collapsed)
   */
  collapseSelectedThread(): void {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return
    const itemId = this.getFlatItemId(flatItem)
    if (this.expandedContent.has(itemId)) {
      this.expandedContent.delete(itemId)
      this.refreshFlatItems()
      this.rebuildSections()
    }
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
        return `pending-${item.data.join(",")}`
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
        return `pending-${item.data.join(",")}`
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
      case 'checks':
        row.primary.fg = selected ? theme.text : theme.subtext1
        break
    }
  }

  /**
   * Get aggregated checks status for collapsed preview
   */
  private getChecksAggregateStatus(): { icon: string; color: string; text: string } {
    const checks = this.prInfo.checks ?? []
    if (checks.length === 0) {
      return { icon: "○", color: theme.overlay0, text: "no checks" }
    }
    
    const pending = checks.filter(c => c.status !== "completed")
    const failed = checks.filter(c => c.status === "completed" && c.conclusion !== "success" && c.conclusion !== "neutral" && c.conclusion !== "skipped")
    const succeeded = checks.filter(c => c.status === "completed" && (c.conclusion === "success" || c.conclusion === "neutral" || c.conclusion === "skipped"))
    
    if (failed.length > 0) {
      return { icon: "✗", color: theme.red, text: `${failed.length} failed` }
    } else if (pending.length > 0) {
      return { icon: "○", color: theme.yellow, text: `${pending.length} pending` }
    } else {
      return { icon: "✓", color: theme.green, text: "all passed" }
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
    const checkCount = this.prInfo.checks?.length ?? 0
    const checksStatus = this.getChecksAggregateStatus()

    return [
      {
        id: 'description',
        title: 'Description',
        count: bodyLines,
        preview: bodyLines > 0 ? `${bodyLines} lines` : "empty",
        hasItems: false,
      },
      {
        id: 'checks',
        title: 'Checks',
        count: checkCount,
        preview: `${checksStatus.icon} ${checksStatus.text}`,
        hasItems: checkCount > 0,
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
    return section === 'files' || section === 'commits' || section === 'conversation' || section === 'checks'
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
      case 'checks':
        this.buildChecksContent(contentBox, isActive)
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
      this.appendReactionRow(container, this.prInfo.bodyReactions)
      return
    }

    const md = new MarkdownRenderable(this.renderer, {
      id: "pr-info-description",
      content: this.prInfo.body,
      syntaxStyle: getSyntaxStyle(),
    })
    container.add(md)
    this.appendReactionRow(container, this.prInfo.bodyReactions)
  }

  /**
   * Format reactions as a single compact line like "👍2 ❤️1". Empty string
   * if there are no reactions. Used in collapsed conversation rows where a
   * full pill list would blow out the single-line height (spec 042).
   */
  private formatInlineReactions(reactions: ReactionSummary[] | undefined): string {
    if (!reactions) return ""
    const visible = reactions.filter(r => r.count > 0)
    if (visible.length === 0) return ""
    return visible.map(r => `${REACTION_META[r.content].emoji}${r.count}`).join(" ")
  }

  /**
   * Append a compact inline reaction row to a container. No-op when the
   * reactions list is empty (spec 042). Uses imperative BoxRenderable /
   * TextRenderable to match the rest of this panel.
   */
  private appendReactionRow(
    container: BoxRenderable,
    reactions: ReactionSummary[] | undefined,
    indent: number = 0,
  ): void {
    if (!reactions) return
    const visible = reactions.filter(r => r.count > 0 || r.viewerHasReacted)
    if (visible.length === 0) return

    const row = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      paddingLeft: indent,
    })
    for (const r of visible) {
      const meta = REACTION_META[r.content]
      const pill = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        paddingX: 1,
        marginRight: 1,
      })
      pill.add(new TextRenderable(this.renderer, {
        content: `${meta.emoji} ${r.count}`,
        // "You reacted" → blue accent on the text; no background so the
        // emoji doesn't sit inside a color block.
        fg: r.viewerHasReacted ? theme.blue : theme.subtext1,
      }))
      row.add(pill)
    }
    container.add(row)
  }

  /**
   * Get icon and color for a check status
   */
  private getCheckStatusDisplay(check: PrCheck): { icon: string; color: string } {
    if (check.status !== "completed") {
      // In progress or queued
      return { icon: "○", color: theme.yellow }
    }
    
    switch (check.conclusion) {
      case "success":
        return { icon: "✓", color: theme.green }
      case "failure":
      case "timed_out":
        return { icon: "✗", color: theme.red }
      case "cancelled":
        return { icon: "⊘", color: theme.overlay0 }
      case "skipped":
        return { icon: "⊘", color: theme.overlay0 }
      case "neutral":
        return { icon: "◇", color: theme.subtext0 }
      case "action_required":
        return { icon: "!", color: theme.peach }
      default:
        return { icon: "?", color: theme.overlay0 }
    }
  }

  /**
   * Build checks content. Renders checks plus, for expanded failing
   * checks, inline annotation rows below them (spec 043).
   */
  private buildChecksContent(container: BoxRenderable, isActive: boolean): void {
    const rows: ItemRowRefs[] = []
    const checks = this.prInfo.checks ?? []

    if (checks.length === 0) {
      container.add(new TextRenderable(this.renderer, {
        content: "No checks configured",
        fg: theme.overlay0,
      }))
      return
    }

    this.refreshFlatCheckItems()

    for (let i = 0; i < this.flatCheckItems.length; i++) {
      const item = this.flatCheckItems[i]!
      const isSelected = isActive && i === this.cursorIndex

      if (item.kind === 'check') {
        rows.push(this.buildCheckRow(container, item.check, isSelected))
      } else if (item.kind === 'annotation') {
        rows.push(this.buildAnnotationRow(container, item.annotation, isSelected))
      } else {
        rows.push(this.buildPlaceholderRow(container, item.placeholder, isSelected))
      }
    }

    this.itemRows.set('checks', rows)
  }

  private buildCheckRow(container: BoxRenderable, check: PrCheck, isSelected: boolean): ItemRowRefs {
    const { icon, color } = this.getCheckStatusDisplay(check)
    const expandable = isFailingCheck(check)
    const expanded = this.expandedCheckIds.has(check.id)

    const row = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 1,
      backgroundColor: isSelected ? theme.surface1 : undefined,
    })

    row.add(new TextRenderable(this.renderer, {
      content: `${icon} `,
      fg: color,
    }))

    const nameText = new TextRenderable(this.renderer, {
      content: check.name,
      fg: isSelected ? theme.text : theme.subtext1,
    })
    row.add(nameText)

    let statusText = ""
    if (check.status !== "completed") {
      statusText = ` (${check.status})`
    } else if (check.conclusion && check.conclusion !== "success") {
      statusText = ` (${check.conclusion})`
    }

    const statusTextEl = new TextRenderable(this.renderer, {
      content: statusText,
      fg: theme.overlay0,
    })
    row.add(statusTextEl)

    if (expandable) {
      const count = check.annotations?.length
      const suffix = count !== undefined && count > 0 ? ` [${count}]` : ""
      row.add(new TextRenderable(this.renderer, {
        content: `  ${expanded ? "▼" : "▶"}${suffix}`,
        fg: theme.overlay0,
      }))
    }

    container.add(row)
    return { container: row, primary: nameText, secondary: statusTextEl }
  }

  private buildAnnotationRow(container: BoxRenderable, annotation: PrCheckAnnotation, isSelected: boolean): ItemRowRefs {
    // Two visual lines per annotation — path on line 1, message indented
    // on line 2. Long paths + long messages each get a full-width budget
    // and the row is still a single cursor stop (spec 043).
    const outer = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      backgroundColor: isSelected ? theme.surface1 : undefined,
    })

    const bulletColor =
      annotation.level === "failure" ? theme.red :
      annotation.level === "warning" ? theme.yellow :
      theme.subtext0

    // Line 1: bullet + path:line[:col]. Omit the trailing `:0` when the
    // annotation is file-level (GitHub uses start_line=0 as "whole file").
    const locText = annotation.startLine > 0
      ? (annotation.startColumn !== undefined
          ? `${annotation.path}:${annotation.startLine}:${annotation.startColumn}`
          : `${annotation.path}:${annotation.startLine}`)
      : annotation.path

    const pathRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 1,
    })
    pathRow.add(new TextRenderable(this.renderer, {
      content: "  ",
      fg: theme.overlay0,
    }))
    pathRow.add(new TextRenderable(this.renderer, {
      content: "• ",
      fg: bulletColor,
    }))
    const pathText = new TextRenderable(this.renderer, {
      content: locText,
      fg: isSelected ? theme.text : theme.subtext1,
    })
    pathRow.add(pathText)
    outer.add(pathRow)

    // Line 2: message (first line only; long messages get truncated
    // by the terminal).
    const firstLine = (annotation.message || "").split("\n")[0] ?? ""
    const msgRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 1,
    })
    const msgEl = new TextRenderable(this.renderer, {
      content: firstLine ? `      ${firstLine}` : "",
      fg: theme.overlay0,
    })
    msgRow.add(msgEl)
    outer.add(msgRow)

    container.add(outer)
    return { container: outer, primary: pathText, secondary: msgEl }
  }

  private buildPlaceholderRow(container: BoxRenderable, kind: 'loading' | 'empty' | 'error', isSelected: boolean): ItemRowRefs {
    const content =
      kind === 'loading' ? "  Loading annotations…" :
      kind === 'empty'   ? "  No annotations — press o to open log" :
                           "  Could not fetch annotations"
    const row = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 1,
      backgroundColor: isSelected ? theme.surface1 : undefined,
    })
    const text = new TextRenderable(this.renderer, {
      content,
      fg: theme.overlay0,
    })
    row.add(text)
    container.add(row)
    return { container: row, primary: text }
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
        const isBot = comment.isBot
        
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          overflow: "hidden",
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })

        const expandIcon = isExpanded ? "▼" : "▶"
        row.add(new TextRenderable(this.renderer, { content: `${expandIcon} `, fg: theme.subtext0, flexShrink: 0 }))
        row.add(new TextRenderable(this.renderer, { content: "PR ", fg: theme.overlay1, flexShrink: 0 }))

        const authorText = new TextRenderable(this.renderer, {
          content: `@${comment.author}`,
          fg: isBot ? theme.overlay0 : (isSelected ? theme.blue : theme.sapphire),
          flexShrink: 0,
        })
        row.add(authorText)

        let bodyText: TextRenderable
        if (isExpanded) {
          bodyText = new TextRenderable(this.renderer, { content: "", fg: theme.subtext1, flexGrow: 1, flexShrink: 1 })
        } else {
          const bodyPreview = truncate(cleanBodyPreview(comment.body), getBodyPreviewWidth())
          bodyText = new TextRenderable(this.renderer, {
            content: `  ${bodyPreview}`,
            fg: isBot ? theme.overlay0 : (isSelected ? theme.text : theme.subtext1),
            flexGrow: 1,
            flexShrink: 1,
          })
        }
        row.add(bodyText)

        const reactionSummary = this.formatInlineReactions(comment.reactions)
        if (reactionSummary) {
          row.add(new TextRenderable(this.renderer, {
            content: `  ${reactionSummary}`,
            fg: theme.overlay1,
            flexShrink: 0,
          }))
        }

        row.add(new TextRenderable(this.renderer, {
          content: `  ${formatTimeAgo(comment.createdAt).padStart(4)}`,
          fg: theme.overlay0,
          flexShrink: 0,
        }))

        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })

        if (isExpanded) {
          this.buildExpandedCommentBody(container, comment.body, 4)
          this.appendReactionRow(container, comment.reactions, 4)
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
          overflow: "hidden",
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })

        const expandIcon = isExpanded ? "▼" : "▶"
        row.add(new TextRenderable(this.renderer, { content: `${expandIcon} `, fg: theme.subtext0, flexShrink: 0 }))
        row.add(new TextRenderable(this.renderer, { content: `${stateIcon}  `, fg: stateColor, flexShrink: 0 }))

        const authorText = new TextRenderable(this.renderer, {
          content: `@${review.author}`,
          fg: isSelected ? theme.blue : theme.sapphire,
          flexShrink: 0,
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
          flexShrink: 0,
        }))

        let bodyText: TextRenderable
        if (!isExpanded && hasThreads) {
          bodyText = new TextRenderable(this.renderer, {
            content: `  (${review.threads.length} ${review.threads.length === 1 ? 'thread' : 'threads'})`,
            fg: theme.overlay0,
            flexGrow: 1,
            flexShrink: 1,
          })
        } else {
          bodyText = new TextRenderable(this.renderer, { content: "", fg: theme.subtext1, flexGrow: 1, flexShrink: 1 })
        }
        row.add(bodyText)

        const reviewReactionSummary = this.formatInlineReactions(review.reactions)
        if (reviewReactionSummary) {
          row.add(new TextRenderable(this.renderer, {
            content: `  ${reviewReactionSummary}`,
            fg: theme.overlay1,
            flexShrink: 0,
          }))
        }

        if (review.submittedAt) {
          row.add(new TextRenderable(this.renderer, {
            content: `  ${formatTimeAgo(review.submittedAt).padStart(4)}`,
            fg: theme.overlay0,
            flexShrink: 0,
          }))
        }

        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
        // Show review body if expanded (but threads are separate items now)
        if (isExpanded && hasBody) {
          this.buildExpandedCommentBody(container, review.body!, 4)
        }
        if (isExpanded) {
          this.appendReactionRow(container, review.reactions, 4)
        }

      } else if (item.type === 'review-thread') {
        const thread = item.data
        const isExpanded = this.expandedContent.has(thread.id)
        const hasReplies = thread.replies.length > 0
        
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          overflow: "hidden",
          paddingLeft: 2,  // Indent to show it's under a review
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })

        // Thread icon
        const icon = thread.isResolved ? "✓" : (isExpanded ? "▼" : "▶")
        const iconColor = thread.isResolved ? theme.green : theme.subtext0
        row.add(new TextRenderable(this.renderer, { content: `${icon} `, fg: iconColor, flexShrink: 0 }))

        // File:line - use more width on wider terminals
        const fileLineWidth = Math.min(40, Math.max(20, Math.floor(getTerminalWidth() * 0.25)))
        const fileShort = truncate(thread.filename.split('/').pop() || thread.filename, fileLineWidth - 5) // Leave room for :line
        row.add(new TextRenderable(this.renderer, {
          content: ` ${fileShort}:${thread.line}  `,
          fg: theme.yellow,
          flexShrink: 0,
        }))

        const authorText = new TextRenderable(this.renderer, {
          content: `@${thread.author}`,
          fg: isSelected ? theme.blue : theme.sapphire,
          flexShrink: 0,
        })
        row.add(authorText)

        let bodyText: TextRenderable
        if (isExpanded) {
          bodyText = new TextRenderable(this.renderer, { content: "", fg: theme.subtext1, flexGrow: 1, flexShrink: 1 })
        } else {
          const bodyPreview = truncate(cleanBodyPreview(thread.body), getThreadBodyPreviewWidth())
          bodyText = new TextRenderable(this.renderer, {
            content: `  ${bodyPreview}`,
            fg: isSelected ? theme.text : theme.subtext1,
            flexGrow: 1,
            flexShrink: 1,
          })
        }
        row.add(bodyText)

        if (hasReplies && !isExpanded) {
          row.add(new TextRenderable(this.renderer, {
            content: `  (${thread.replies.length + 1})`,
            fg: theme.overlay0,
            flexShrink: 0,
          }))
        }

        const threadReactionSummary = this.formatInlineReactions(thread.reactions)
        if (threadReactionSummary) {
          row.add(new TextRenderable(this.renderer, {
            content: `  ${threadReactionSummary}`,
            fg: theme.overlay1,
            flexShrink: 0,
          }))
        }

        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
        // Show thread content if expanded
        if (isExpanded) {
          // Show diff hunk context if available
          if (thread.diffHunk && thread.diffHunk.trim()) {
            this.buildDiffHunkDisplay(container, thread.diffHunk, 6)
          } else {
            // No diff hunk from API — try to extract from loaded diff files
            const fileContent = this.getFileDiffContent(thread.filename, thread.line)
            if (fileContent) {
              this.buildDiffHunkDisplay(container, fileContent, 6)
            }
          }
          
          // Comment body
          this.buildExpandedCommentBody(container, thread.body, 6)
          this.appendReactionRow(container, thread.reactions, 6)

          // Replies
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
            this.appendReactionRow(container, reply.reactions, 8)
          }
        }


      } else {
        // Pending reviewers — one selectable block with a header row and
        // the reviewers wrapped onto as many name-rows as needed so the
        // list stays scannable without flooding the section with N
        // identical "awaiting review" rows.
        const reviewers = item.data

        const block = new BoxRenderable(this.renderer, {
          flexDirection: "column",
          marginTop: 1,
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })

        const headerRow = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
        })
        headerRow.add(new TextRenderable(this.renderer, { content: "○ ", fg: theme.yellow, flexShrink: 0 }))
        const authorText = new TextRenderable(this.renderer, {
          content: `awaiting review (${reviewers.length})`,
          fg: theme.yellow,
          flexShrink: 0,
        })
        headerRow.add(authorText)
        block.add(headerRow)

        // Pack names into rows; leave 4 cols of left indent and a small
        // right gutter so the wrap matches terminal width.
        const LEFT_INDENT = 4
        const RIGHT_GUTTER = 4
        const available = Math.max(20, getTerminalWidth() - LEFT_INDENT - RIGHT_GUTTER)
        const chunks: string[][] = []
        let current: string[] = []
        let currentWidth = 0
        for (const name of reviewers) {
          const piece = `@${name}`
          const pieceWidth = piece.length + 2 // trailing 2-space separator
          if (current.length > 0 && currentWidth + pieceWidth > available) {
            chunks.push(current)
            current = []
            currentWidth = 0
          }
          current.push(piece)
          currentWidth += pieceWidth
        }
        if (current.length > 0) chunks.push(current)

        for (const chunk of chunks) {
          const nameRow = new BoxRenderable(this.renderer, {
            flexDirection: "row",
            height: 1,
            paddingLeft: LEFT_INDENT,
          })
          nameRow.add(new TextRenderable(this.renderer, {
            content: chunk.join("  "),
            fg: isSelected ? theme.blue : theme.sapphire,
          }))
          block.add(nameRow)
        }

        container.add(block)
        rows.push({ container: block, primary: authorText })
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
   * Extract diff context around a line from the loaded diff files.
   * Returns a few lines of context or null if the file isn't found.
   */
  private getFileDiffContent(filename: string, line: number): string | null {
    const file = this.files.find(f => f.filename === filename)
    if (!file?.content) return null

    const lines = file.content.split("\n")
    // Find content lines near the target line number
    // The diff format includes headers, so we scan for the relevant hunk
    const contextRadius = 4
    const start = Math.max(0, line - contextRadius - 1)
    const end = Math.min(lines.length, line + contextRadius)

    // Find the closest @@ hunk header before our target
    let hunkStart = start
    for (let i = start; i >= 0; i--) {
      if (lines[i]?.startsWith("@@")) {
        hunkStart = i
        break
      }
    }

    const contextLines = lines.slice(hunkStart, end)
    if (contextLines.length === 0) return null
    return contextLines.join("\n")
  }

  /**
   * Build a diff hunk display showing code context for a thread.
   * Shows the last few lines of the diff hunk with diff coloring.
   */
  private buildDiffHunkDisplay(container: BoxRenderable, diffHunk: string, indent: number): void {
    const lines = diffHunk.split("\n")
    // Show only the last ~8 lines of the hunk (the most relevant context)
    const maxLines = 8
    const startIdx = Math.max(0, lines.length - maxLines)
    const visibleLines = lines.slice(startIdx)

    const hunkBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      paddingLeft: indent,
      paddingRight: 2,
      marginTop: 1,
      backgroundColor: theme.mantle,
    })

    for (const line of visibleLines) {
      if (!line && visibleLines.indexOf(line) === visibleLines.length - 1) continue // skip trailing empty line
      let fg: string = theme.overlay1
      if (line.startsWith("+")) {
        fg = theme.green
      } else if (line.startsWith("-")) {
        fg = theme.red
      } else if (line.startsWith("@@")) {
        fg = theme.blue
      }
      hunkBox.add(new TextRenderable(this.renderer, {
        content: line || " ",
        fg,
      }))
    }

    container.add(hunkBox)
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
    this.appendReactionRow(container, thread.reactions, indent + 2)

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
      this.appendReactionRow(container, reply.reactions, indent + 4)
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

    // Main container — inline flex child of the main content row (spec 041,
    // previously an absolute overlay).
    const container = new BoxRenderable(this.renderer, {
      id: "pr-info-panel",
      flexGrow: 1,
      height: "100%",
      flexDirection: "column",
      backgroundColor: theme.base,
    })

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

    // Reviews row — always rendered so the metadata block has a
    // predictable shape. Shows "no reviews yet" when nobody has
    // submitted a review (pending/requested reviewers are listed in the
    // Conversation section, not here).
    const reviewerSummary = buildReviewerSummary(prInfo.reviews ?? [], prInfo.requestedReviewers ?? [])
    const reviewsRow = new BoxRenderable(this.renderer, { flexDirection: "row", height: 1 })
    reviewsRow.add(new TextRenderable(this.renderer, { content: "Reviews".padEnd(12), fg: theme.overlay0 }))
    if (reviewerSummary.length > 0) {
      for (const reviewer of reviewerSummary) {
        reviewsRow.add(new TextRenderable(this.renderer, { content: `${reviewer.icon} ${reviewer.name}  `, fg: reviewer.color }))
      }
    } else {
      reviewsRow.add(new TextRenderable(this.renderer, { content: "no reviews yet", fg: theme.overlay0 }))
    }
    basicInfo.add(reviewsRow)

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
   * Update comment input overlay
   */
  updateCommentInput(open: boolean, text: string, loading: boolean, error: string | null): void {
    if (!open) {
      // Remove overlay if it exists
      if (this.commentInputOverlay) {
        this.container.remove(this.commentInputOverlay.id)
        this.commentInputOverlay = null
        this.commentInputText = null
        this.commentInputStatus = null
      }
      return
    }

    // Create overlay if it doesn't exist
    if (!this.commentInputOverlay) {
      this.commentInputOverlay = new BoxRenderable(this.renderer, {
        id: "pr-comment-input-overlay",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 100,
        justifyContent: "center",
        alignItems: "center",
      })
      
      // Dim background
      const bg = new BoxRenderable(this.renderer, {
        id: "pr-comment-input-bg",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "#00000080",
      })
      this.commentInputOverlay.add(bg)
      
      // Input box
      const inputBox = new BoxRenderable(this.renderer, {
        id: "pr-comment-input-box",
        width: 60,
        flexDirection: "column",
        backgroundColor: theme.mantle,
        borderStyle: "single",
        borderColor: theme.blue,
        padding: 1,
      })
      
      // Header
      const header = new BoxRenderable(this.renderer, {
        id: "pr-comment-input-header",
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 1,
      })
      header.add(new TextRenderable(this.renderer, { content: "Add PR Comment", fg: theme.text }))
      header.add(new TextRenderable(this.renderer, { content: "Esc to cancel", fg: theme.overlay0 }))
      inputBox.add(header)
      
      // Text display area
      this.commentInputText = new TextRenderable(this.renderer, {
        id: "pr-comment-input-text",
        content: text || "Type your comment...",
        fg: text ? theme.text : theme.overlay0,
      })
      inputBox.add(this.commentInputText)
      
      // Status line
      this.commentInputStatus = new TextRenderable(this.renderer, {
        id: "pr-comment-input-status",
        content: "",
        fg: theme.overlay0,
      })
      const statusBox = new BoxRenderable(this.renderer, {
        id: "pr-comment-input-status-box",
        marginTop: 1,
      })
      statusBox.add(this.commentInputStatus)
      inputBox.add(statusBox)
      
      this.commentInputOverlay.add(inputBox)
      this.container.add(this.commentInputOverlay)
    }

    // Update text
    if (this.commentInputText) {
      this.commentInputText.content = text || "Type your comment..."
      this.commentInputText.fg = text ? theme.text : theme.overlay0
    }
    
    // Update status
    if (this.commentInputStatus) {
      if (loading) {
        this.commentInputStatus.content = "Submitting..."
        this.commentInputStatus.fg = theme.yellow
      } else if (error) {
        this.commentInputStatus.content = error
        this.commentInputStatus.fg = theme.red
      } else {
        this.commentInputStatus.content = "Enter to submit"
        this.commentInputStatus.fg = theme.overlay0
      }
    }
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
