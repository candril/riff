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
  | { type: 'review-thread'; data: ReviewThread }

/**
 * A review thread (code comment with replies)
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
  expanded: boolean
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
 * Format a relative time string
 */
function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString()
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
 * Truncate string to max length with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + "…"
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

const ALL_SECTIONS: PRInfoPanelSection[] = ['description', 'reviews', 'conversation', 'files', 'commits']

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
  private cursorIndex: number = 0
  
  // Expanded state per section (all open by default)
  private expandedSections: Set<PRInfoPanelSection> = new Set(ALL_SECTIONS)
  
  // Thread expanded state (by thread root comment id)
  private expandedThreads: Set<string> = new Set()
  
  // Conversation items (computed from prInfo + comments)
  private conversationItems: ConversationItem[] = []
  
  // Section containers (for rebuilding on section change)
  private sectionsContainer: BoxRenderable | null = null
  private sectionBoxes: BoxRenderable[] = []
  
  // Item row refs for cursor updates
  private itemRows: Map<PRInfoPanelSection, ItemRowRefs[]> = new Map()

  constructor(renderer: CliRenderer, prInfo: PrInfo, files: DiffFile[] = [], comments: Comment[] = []) {
    this.renderer = renderer
    this.prInfo = prInfo
    this.files = files
    this.comments = comments
    
    // Build conversation items
    this.conversationItems = this.buildConversationItems()
    
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
   * Get the max cursor index for the current section
   */
  getMaxCursorIndex(): number {
    switch (this.activeSection) {
      case 'description':
        return 0  // Description has no items, just expanded content
      case 'reviews':
        return Math.max(0, this.getReviewItems().length - 1)
      case 'conversation':
        return Math.max(0, this.conversationItems.length - 1)
      case 'files':
        return Math.max(0, this.files.length - 1)
      case 'commits':
        return Math.max(0, (this.prInfo.commits?.length ?? 0) - 1)
    }
  }

  /**
   * Build conversation items from PR comments and code comments
   */
  private buildConversationItems(): ConversationItem[] {
    const items: ConversationItem[] = []
    
    // Add PR conversation comments
    for (const comment of this.prInfo.conversationComments ?? []) {
      items.push({ type: 'pr-comment', data: comment })
    }
    
    // Group code comments into threads
    const threadMap = new Map<string, ReviewThread>()
    
    for (const comment of this.comments) {
      // Skip if this is a reply (will be added to parent thread)
      if (comment.inReplyTo) continue
      
      // Create thread from root comment
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
        expanded: false, // Default collapsed for threads with replies
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
    
    // Add threads to items, sorted by date
    const threads = Array.from(threadMap.values())
    for (const thread of threads) {
      // Sort replies by date
      thread.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      // Expand by default if no replies or resolved
      thread.expanded = thread.replies.length === 0 || thread.isResolved
      items.push({ type: 'review-thread', data: thread })
    }
    
    // Sort all items by date
    items.sort((a, b) => {
      const dateA = a.type === 'pr-comment' ? a.data.createdAt : a.data.createdAt
      const dateB = b.type === 'pr-comment' ? b.data.createdAt : b.data.createdAt
      return new Date(dateA).getTime() - new Date(dateB).getTime()
    })
    
    return items
  }

  /**
   * Get combined review items (reviews + pending reviewers)
   */
  private getReviewItems(): Array<{ type: 'review' | 'pending', data: PrReview | string }> {
    const reviews = this.prInfo.reviews ?? []
    const requestedReviewers = this.prInfo.requestedReviewers ?? []
    const reviewedBy = reviews.filter(r => r.state !== "PENDING")
    const pendingReviewers = requestedReviewers.filter(
      r => !reviews.some(rev => rev.author === r)
    )
    
    const items: Array<{ type: 'review' | 'pending', data: PrReview | string }> = []
    for (const review of reviewedBy) {
      items.push({ type: 'review', data: review })
    }
    for (const reviewer of pendingReviewers) {
      items.push({ type: 'pending', data: reviewer })
    }
    return items
  }

  /**
   * Move cursor within current section
   * Returns true if cursor moved, false if at boundary
   */
  moveCursor(delta: number): boolean {
    const maxIndex = this.getMaxCursorIndex()
    const newIndex = Math.max(0, Math.min(maxIndex, this.cursorIndex + delta))
    
    if (newIndex === this.cursorIndex) return false
    
    // Update old row (deselect)
    this.updateItemRow(this.activeSection, this.cursorIndex, false)
    
    // Update new row (select)
    this.cursorIndex = newIndex
    this.updateItemRow(this.activeSection, this.cursorIndex, true)
    return true
  }

  /**
   * Cycle to next/previous section (Tab navigation)
   */
  cycleSection(delta: number): void {
    const currentIndex = ALL_SECTIONS.indexOf(this.activeSection)
    const newIndex = (currentIndex + delta + ALL_SECTIONS.length) % ALL_SECTIONS.length
    
    this.setActiveSection(ALL_SECTIONS[newIndex]!)
  }

  /**
   * Set the active section
   */
  setActiveSection(section: PRInfoPanelSection): void {
    if (section === this.activeSection) return
    
    // Deselect old section's cursor
    this.updateItemRow(this.activeSection, this.cursorIndex, false)
    
    this.activeSection = section
    this.cursorIndex = 0
    
    // Select new section's first item if expanded
    if (this.expandedSections.has(section)) {
      this.updateItemRow(section, 0, true)
    }
    
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
    if (this.activeSection !== 'commits') return undefined
    return this.prInfo.commits?.[this.cursorIndex]
  }

  /**
   * Get selected file
   */
  getSelectedFile(): DiffFile | undefined {
    if (this.activeSection !== 'files') return undefined
    return this.files[this.cursorIndex]
  }

  /**
   * Get selected conversation item
   */
  getSelectedConversationItem(): ConversationItem | undefined {
    if (this.activeSection !== 'conversation') return undefined
    return this.conversationItems[this.cursorIndex]
  }

  /**
   * Get the jump location for the selected conversation item (file/line for code comments)
   */
  getSelectedCommentLocation(): { filename: string; line: number } | undefined {
    const item = this.getSelectedConversationItem()
    if (!item) return undefined
    
    if (item.type === 'review-thread') {
      return { filename: item.data.filename, line: item.data.line }
    }
    return undefined // PR comments have no code location
  }

  /**
   * Toggle expand/collapse for the selected thread
   */
  toggleSelectedThread(): void {
    const item = this.getSelectedConversationItem()
    if (!item || item.type !== 'review-thread') return
    
    const threadId = item.data.id
    if (this.expandedThreads.has(threadId)) {
      this.expandedThreads.delete(threadId)
    } else {
      this.expandedThreads.add(threadId)
    }
    // Update the thread's expanded state
    item.data.expanded = this.expandedThreads.has(threadId)
    this.rebuildSections()
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
      case 'reviews':
        row.primary.fg = selected ? theme.text : theme.subtext1
        break
    }
  }

  /**
   * Build section configs
   */
  private getSectionConfigs(): SectionConfig[] {
    const reviews = this.prInfo.reviews ?? []
    const reviewedBy = reviews.filter(r => r.state !== "PENDING")
    const approved = reviewedBy.filter(r => r.state === "APPROVED").length
    const changesRequested = reviewedBy.filter(r => r.state === "CHANGES_REQUESTED").length
    
    const conversationCount = this.conversationItems.length
    const commitCount = this.prInfo.commits?.length ?? 0
    const fileCount = this.files.length
    const bodyLines = (this.prInfo.body || "").split("\n").filter(l => l.trim()).length

    // Reviews preview: "✓2 ✗1"
    let reviewsPreview = ""
    if (approved > 0) reviewsPreview += `✓${approved}`
    if (changesRequested > 0) reviewsPreview += (reviewsPreview ? " " : "") + `✗${changesRequested}`

    return [
      {
        id: 'description',
        title: 'Description',
        count: bodyLines,
        preview: bodyLines > 0 ? `${bodyLines} lines` : "empty",
        hasItems: false,
      },
      {
        id: 'reviews',
        title: 'Reviews',
        count: this.getReviewItems().length,
        preview: reviewsPreview || "none",
        hasItems: this.getReviewItems().length > 0,
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
      // - Section is active AND (collapsed OR has no selectable items)
      const headerHighlighted = isActive && (!isExpanded || !hasItems)
      
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
        content: `${indicator} ${config.title} (${config.count})`,
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
      case 'reviews':
        this.buildReviewsContent(contentBox, isActive)
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
    
    container.add(new MarkdownRenderable(this.renderer, {
      id: "pr-info-description",
      content: this.prInfo.body,
      syntaxStyle: getSyntaxStyle(),
    }))
  }

  /**
   * Build reviews content
   */
  private buildReviewsContent(container: BoxRenderable, isActive: boolean): void {
    const items = this.getReviewItems()
    const rows: ItemRowRefs[] = []
    
    if (items.length === 0) {
      container.add(new TextRenderable(this.renderer, {
        content: "No reviews yet",
        fg: theme.overlay0,
      }))
      return
    }
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      const isSelected = isActive && i === this.cursorIndex
      
      const row = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        height: 1,
        backgroundColor: isSelected ? theme.surface1 : undefined,
      })
      
      if (item.type === 'review') {
        const review = item.data as PrReview
        const { icon, color } = getReviewIcon(review.state)
        const stateLabel = review.state === "CHANGES_REQUESTED" 
          ? "changes requested" 
          : review.state.toLowerCase()
        
        row.add(new TextRenderable(this.renderer, { content: `${icon} `, fg: color }))
        const nameText = new TextRenderable(this.renderer, {
          content: `@${review.author}`.padEnd(20),
          fg: isSelected ? theme.text : theme.subtext1,
        })
        row.add(nameText)
        row.add(new TextRenderable(this.renderer, { content: stateLabel, fg: theme.subtext0 }))
        rows.push({ container: row, primary: nameText })
      } else {
        const reviewer = item.data as string
        row.add(new TextRenderable(this.renderer, { content: "○ ", fg: theme.yellow }))
        const nameText = new TextRenderable(this.renderer, {
          content: `@${reviewer}`.padEnd(20),
          fg: isSelected ? theme.text : theme.subtext1,
        })
        row.add(nameText)
        row.add(new TextRenderable(this.renderer, { content: "awaiting review", fg: theme.yellow }))
        rows.push({ container: row, primary: nameText })
      }
      
      container.add(row)
    }
    
    this.itemRows.set('reviews', rows)
  }

  /**
   * Build conversation content (unified: PR comments + code threads)
   */
  private buildConversationContent(container: BoxRenderable, isActive: boolean): void {
    const rows: ItemRowRefs[] = []
    
    if (this.conversationItems.length === 0) {
      container.add(new TextRenderable(this.renderer, {
        content: "No comments",
        fg: theme.overlay0,
      }))
      return
    }
    
    for (let i = 0; i < this.conversationItems.length; i++) {
      const item = this.conversationItems[i]!
      const isSelected = isActive && i === this.cursorIndex
      
      if (item.type === 'pr-comment') {
        // PR conversation comment (no code location)
        const comment = item.data
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })
        
        row.add(new TextRenderable(this.renderer, { content: "💬 ", fg: theme.subtext0 }))
        
        const authorText = new TextRenderable(this.renderer, {
          content: `@${comment.author}`.padEnd(16),
          fg: isSelected ? theme.blue : theme.sapphire,
        })
        row.add(authorText)
        
        const bodyPreview = truncate(comment.body.replace(/\n/g, " "), 35)
        const bodyText = new TextRenderable(this.renderer, {
          content: bodyPreview.padEnd(37),
          fg: isSelected ? theme.text : theme.subtext1,
        })
        row.add(bodyText)
        
        row.add(new TextRenderable(this.renderer, {
          content: formatTimeAgo(comment.createdAt),
          fg: theme.overlay0,
        }))
        
        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
      } else {
        // Review thread (code comment)
        const thread = item.data
        const hasReplies = thread.replies.length > 0
        const isExpanded = thread.expanded || this.expandedThreads.has(thread.id)
        
        // Thread header row
        const row = new BoxRenderable(this.renderer, {
          flexDirection: "row",
          height: 1,
          backgroundColor: isSelected ? theme.surface1 : undefined,
        })
        
        // Icon: resolved, expandable, or single
        const icon = thread.isResolved ? "✓" : hasReplies ? (isExpanded ? "▼" : "▶") : "○"
        const iconColor = thread.isResolved ? theme.green : theme.subtext0
        row.add(new TextRenderable(this.renderer, { content: `${icon} `, fg: iconColor }))
        
        // File:line indicator
        const fileShort = truncate(thread.filename.split('/').pop() || thread.filename, 15)
        row.add(new TextRenderable(this.renderer, {
          content: `${fileShort}:${thread.line}`.padEnd(20),
          fg: theme.yellow,
        }))
        
        const authorText = new TextRenderable(this.renderer, {
          content: `@${thread.author}`.padEnd(14),
          fg: isSelected ? theme.blue : theme.sapphire,
        })
        row.add(authorText)
        
        const bodyPreview = truncate(thread.body.replace(/\n/g, " "), 25)
        const bodyText = new TextRenderable(this.renderer, {
          content: bodyPreview,
          fg: isSelected ? theme.text : theme.subtext1,
        })
        row.add(bodyText)
        
        if (hasReplies) {
          row.add(new TextRenderable(this.renderer, {
            content: ` (${thread.replies.length + 1})`,
            fg: theme.overlay0,
          }))
        }
        
        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
        // Show replies if expanded
        if (isExpanded && hasReplies) {
          for (const reply of thread.replies) {
            const replyRow = new BoxRenderable(this.renderer, {
              flexDirection: "row",
              height: 1,
              paddingLeft: 4,
            })
            
            replyRow.add(new TextRenderable(this.renderer, { content: "└ ", fg: theme.surface2 }))
            replyRow.add(new TextRenderable(this.renderer, {
              content: `@${reply.author ?? 'you'}`.padEnd(14),
              fg: theme.subtext0,
            }))
            
            const replyPreview = truncate(reply.body.replace(/\n/g, " "), 40)
            replyRow.add(new TextRenderable(this.renderer, {
              content: replyPreview,
              fg: theme.subtext1,
            }))
            
            container.add(replyRow)
          }
        }
      }
    }
    
    this.itemRows.set('conversation', rows)
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
        content: truncate(file.filename, 50).padEnd(52),
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
    for (let i = 0; i < Math.min(maxDisplay, commits.length); i++) {
      const commit = commits[i]!
      const isSelected = isActive && i === this.cursorIndex
      
      const row = new BoxRenderable(this.renderer, {
        flexDirection: "row",
        height: 1,
        backgroundColor: isSelected ? theme.surface1 : undefined,
      })
      
      const shaText = new TextRenderable(this.renderer, {
        content: commit.sha.padEnd(9),
        fg: isSelected ? theme.peach : theme.yellow,
      })
      row.add(shaText)
      
      const messageText = new TextRenderable(this.renderer, {
        content: truncate(commit.message, 50).padEnd(52),
        fg: isSelected ? theme.text : theme.subtext1,
      })
      row.add(messageText)
      
      row.add(new TextRenderable(this.renderer, {
        content: formatDateTime(commit.date),
        fg: theme.subtext0,
      }))
      
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
    const footer = new BoxRenderable(this.renderer, {
      height: 1,
      width: "100%",
      backgroundColor: theme.mantle,
      paddingLeft: 2,
      flexDirection: "row",
    })
    footer.add(new TextRenderable(this.renderer, { content: "Tab ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "section  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "j/k ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "nav  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "za ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "toggle  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "Enter ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "action  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "y ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "copy  ", fg: theme.subtext0 }))
    footer.add(new TextRenderable(this.renderer, { content: "o ", fg: theme.yellow }))
    footer.add(new TextRenderable(this.renderer, { content: "open", fg: theme.subtext0 }))
    container.add(footer)

    return { container, scrollBox }
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
