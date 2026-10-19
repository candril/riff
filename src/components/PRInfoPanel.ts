/**
 * PR Info Panel v2 - Section-based navigation
 * Shows PR metadata with collapsible sections navigated via Tab/j/k
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  MarkdownRenderable,
  InputRenderable,
  InputRenderableEvents,
  SyntaxStyle,
  type NativeResourceOwner,
  RGBA,
  type CliRenderer,
} from "@opentui/core"
import type { PrInfo, PrReview, PrCommit, PrCheck, PrCheckAnnotation } from "../providers/github"
import { getPrCheckAnnotations } from "../providers/github"
import { discard, keepAlive } from "../utils/renderables"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow, PreviewSet } from "../utils/previews"
import type { LinkSource } from "../utils/link-targets"
import { stackText, type StackInfo } from "../utils/stack"
import type { Comment, ReactionSummary, ReactionTarget } from "../types"
import { REACTION_META } from "../types"
import type { PRInfoPanelSection } from "../state"
import { extractCommentImages, type CommentImage } from "../utils/comment-images"
import { softenCommentHtml } from "../utils/comment-html"
import { annotateReferences } from "../utils/references"
import { resolvedReferences, referenceRepo } from "../features/references"
import { tableRenderer } from "./markdown-tables-in-markdown"
import { MarkdownBodies } from "./markdown-bodies"
import { colors, theme } from "../theme"
import {
  TIME_COLUMN_WIDTH,
  cleanBodyPreview,
  formatTimeAgo,
  getCheckStatusDisplay,
  getReviewIcon,
  threadActivityAt,
  truncate,
} from "./pr-info-format"
import {
  ALL_SECTIONS,
  conversationItems,
  flatCheckItems,
  flatConversationItemId,
  flatConversationItems,
  isFailingCheck,
  visibleCommits,
  visibleFiles,
  visiblePreviews,
  type ConversationItem,
  type FlatCheckItem,
  type FlatConversationItem,
  type ReviewThread,
} from "./pr-info-items"
import { sectionConfigs } from "./pr-info-sections"
import { commitRows, fileRows, previewRows, type ListRows } from "./pr-info-list-rows"
import { createPrInfoListIsland, type PrInfoListIsland } from "../app/pr-info-lists"

// Tests run several renderers in one process, and a style dies with the renderer that owns it.
const syntaxStyles = new WeakMap<NativeResourceOwner, SyntaxStyle>()
function getSyntaxStyle(owner: NativeResourceOwner): SyntaxStyle {
  if (!syntaxStyles.has(owner)) {
    syntaxStyles.set(owner, SyntaxStyle.fromStyles({
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
    }, owner))
  }
  return syntaxStyles.get(owner)!
}

/**
 * A body with its `#412`s answered — the title and state of what they point
 * at, where riff has been told (spec 059).
 */
function withReferences(body: string): string {
  return annotateReferences(body, resolvedReferences(), referenceRepo())
}

/**
 * Get terminal width (defaults to 80 if unavailable)
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80
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
 * Thread rows have: indent (4) + icon (2) + file:line (padded 24) + author (~15) + reply count (~6) + time (6) + padding (~6)
 */
function getThreadBodyPreviewWidth(): number {
  const termWidth = getTerminalWidth()
  const reserved = 63
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

type ListSection = 'previews' | 'files' | 'commits'

function isListSection(section: PRInfoPanelSection): section is ListSection {
  return section === 'previews' || section === 'files' || section === 'commits'
}

/** The description's cursor row: the background every other selected row has. */
const DESCRIPTION_CURSOR_BG = RGBA.fromHex(theme.surface1)

/** Rows kept between the cursor and the edge it is moving towards. */
const CURSOR_SCROLL_OFF = 3

/**
 * Everything about the panel that is the reader's rather than the PR's,
 * so a rebuilt panel can be handed it back.
 */
export interface PRInfoPanelPosition {
  activeSection: PRInfoPanelSection
  cursorIndex: number
  expandedSections: Set<PRInfoPanelSection>
  expandedThreads: Set<string>
  expandedContent: Set<string>
  expandedCheckIds: Set<number>
  scrollTop: number
}

/**
 * PR Info Panel - class-based for efficient updates
 */
export class PRInfoPanelClass {
  private renderer: CliRenderer
  /** Comment and description bodies, kept alive across rebuilds. */
  private bodies: MarkdownBodies
  private container: BoxRenderable
  private scrollBox: ScrollBoxRenderable
  private prInfo: PrInfo
  private files: DiffFile[]
  private comments: Comment[]
  
  // What `Ctrl-f` narrows the panel to: rows whose text contains it, in
  // every section that has rows (spec 065). Empty means everything.
  private filter: string = ""
  private filterInput: InputRenderable
  private filterRow: BoxRenderable | null = null
  private filterFocused: boolean = false
  private onFilterChange: ((value: string) => void) | null = null

  // Section state
  private activeSection: PRInfoPanelSection = 'description'
  private cursorIndex: number = -1  // -1 = on section header
  
  // Sections are collapsed on arrival but for the description: the panel's
  // job is to say what there is — headers with their counts and a summary
  // each — and let you open the one you came for, while the one thing you
  // always want is what the PR says it does (specs 062, 067).
  private expandedSections: Set<PRInfoPanelSection> = new Set(['description'])
  
  // Thread expanded state (by thread root comment id) - shows replies
  private expandedThreads: Set<string> = new Set()
  
  // Content expanded state (by item id) - shows full comment body
  private expandedContent: Set<string> = new Set()
  
  // Conversation items (computed from prInfo + comments)
  private conversationItems: ConversationItem[] = []

  // Comments another section now speaks for — the deploy bot's preview
  // table, say (specs 067, 068). Folded away here, never dropped.
  private hiddenConversationIds: ReadonlySet<string> = new Set()

  // Preview links lifted out of a deploy bot's table (spec 068).
  private previews: PreviewSet | null = null

  // The row naming the PR this one is stacked on (spec 072).
  private stackText: TextRenderable | null = null
  
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
  private descriptionBox: BoxRenderable | null = null
  private descriptionCursorRow: BoxRenderable | null = null
  // Set when the cursor moved; the next frame scrolls it into view, once
  // layout has placed whatever the move rebuilt.
  private revealPending = false
  
  // Item row refs for cursor updates
  private itemRows: Map<PRInfoPanelSection, ItemRowRefs[]> = new Map()

  // Made the first time their section opens, and mounted into each rebuild's
  // section box from then on.
  private listIslands: Map<ListSection, PrInfoListIsland> = new Map()

  // Flash labels by row id, while `s` is labelling (spec 066), and the
  // header texts they are painted onto.
  private flashLabels: ReadonlyMap<string, string> = new Map()
  
  // Comment input overlay
  private commentInputOverlay: BoxRenderable | null = null
  private commentInputText: TextRenderable | null = null
  private commentInputStatus: TextRenderable | null = null

  constructor(renderer: CliRenderer, prInfo: PrInfo, files: DiffFile[] = [], comments: Comment[] = []) {
    this.renderer = renderer
    this.bodies = new MarkdownBodies(renderer)
    this.prInfo = prInfo
    this.files = files
    this.comments = comments
    
    this.filterInput = new InputRenderable(renderer, {
      id: "pr-info-filter",
      placeholder: "filter rows…",
      placeholderColor: theme.overlay0,
      backgroundColor: theme.base,
      textColor: theme.text,
      focusedBackgroundColor: theme.base,
      focusedTextColor: theme.text,
      cursorColor: theme.yellow,
      flexGrow: 1,
    })
    this.filterInput.on(InputRenderableEvents.INPUT, (value: string) => {
      this.onFilterChange?.(value)
    })

    // Build conversation items
    this.conversationItems = conversationItems(this.prInfo, this.comments, this.hiddenConversationIds)
    this.refreshFlatItems()
    this.refreshFlatCheckItems()
    
    // Build the panel
    const { container, scrollBox } = this.build()
    this.container = keepAlive(container)
    this.scrollBox = scrollBox
  }

  /**
   * Get the container element
   */
  getContainer(): BoxRenderable {
    return this.container
  }

  /**
   * How wide a markdown table in this panel may be.
   *
   * The panel's own width, once it has one. It does not have one while the
   * first build runs: `build()` is called from the constructor and
   * `this.container` is assigned from what it returns, so a table in the
   * PR's description — rendered inside that build — asks a panel that does
   * not exist yet. The panel is the whole of the row it is mounted in, so
   * the terminal's width is the width it is about to have, and it is what
   * the inline overlay's tables already measure against.
   */
  private markdownWidth(): number {
    const container = this.container as BoxRenderable | undefined
    return container?.width || this.renderer.width
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
   * Where the reader is in the panel. Refreshed PR data means a new panel
   * instance (the old one caches prInfo, files and comments), so the two
   * halves of this pair are what carries the reader across it (spec 063).
   */
  capturePosition(): PRInfoPanelPosition {
    return {
      activeSection: this.activeSection,
      cursorIndex: this.cursorIndex,
      expandedSections: new Set(this.expandedSections),
      expandedThreads: new Set(this.expandedThreads),
      expandedContent: new Set(this.expandedContent),
      expandedCheckIds: new Set(this.expandedCheckIds),
      scrollTop: this.scrollBox.scrollTop,
    }
  }

  restorePosition(position: PRInfoPanelPosition): void {
    this.activeSection = position.activeSection
    this.expandedSections = new Set(position.expandedSections)
    this.expandedThreads = new Set(position.expandedThreads)
    this.expandedContent = new Set(position.expandedContent)
    this.expandedCheckIds = new Set(position.expandedCheckIds)

    // The section can have fewer items than it had — a review that was
    // resolved away, a check that finished and folded its annotations.
    this.refreshFlatItems()
    this.refreshFlatCheckItems()
    // Description rows are counted by layout, which a new panel has not had
    // yet; the cursor row is clamped where it is painted instead.
    this.cursorIndex = this.activeSection === 'description'
      ? position.cursorIndex
      : Math.min(position.cursorIndex, this.getMaxCursorIndex())

    this.rebuildSections()
    // Where the reader had scrolled to wins over a reveal asked for before
    // the restore: the cursor was in view there when it was captured.
    this.revealPending = false
    this.scrollBox.scrollTop = position.scrollTop
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
    return this.getItemCountForSection(this.activeSection)
  }

  /**
   * Get the max cursor index for the current section
   * -1 = section header, 0+ = items
   */
  getMaxCursorIndex(): number {
    const itemCount = this.getItemCount()
    return itemCount > 0 ? itemCount - 1 : -1
  }

  private refreshFlatItems(): void {
    this.flatConversationItems = flatConversationItems(this.conversationItems, this.filter, this.expandedContent)
  }

  private refreshFlatCheckItems(): void {
    this.flatCheckItems = flatCheckItems(this.prInfo.checks, this.expandedCheckIds, this.filter)
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

    const wasOnHeader = this.cursorIndex === -1
    const isOnHeader = newIndex === -1

    // Update old row (deselect) - only for items, not header
    if (this.cursorIndex >= 0) {
      this.updateItemRow(this.activeSection, this.cursorIndex, false)
    }

    // Update new row (select) - only for items, not header
    this.cursorIndex = newIndex
    if (this.cursorIndex >= 0) {
      this.updateItemRow(this.activeSection, this.cursorIndex, true)
    }
    this.pushListRows(this.activeSection)

    // Section header highlight only changes when the cursor crosses
    // the header / item boundary — skip the rebuild otherwise so j/k
    // inside a section doesn't tear down + rebuild every renderable
    // (which causes visible flicker on markdown bodies in particular).
    if (wasOnHeader !== isOnHeader) {
      this.rebuildSections()
    }
    this.followCursor()
    return true
  }

  /**
   * One row down or up — within the section, else across into the next
   * one. False at either end of the panel: like a buffer, it does not wrap.
   */
  step(delta: 1 | -1): boolean {
    if (this.isSectionExpanded() && this.moveCursor(delta)) return true

    const next = ALL_SECTIONS.indexOf(this.activeSection) + delta
    if (next < 0 || next >= ALL_SECTIONS.length) return false
    if (delta > 0) this.cycleSection(1)
    else this.cycleSectionToEnd(-1)
    return true
  }

  /**
   * Ctrl-d / Ctrl-u: the view and the cursor move half a page together, so
   * the cursor keeps its place on screen for as long as there is room.
   */
  halfPage(delta: 1 | -1): void {
    const half = Math.max(1, Math.floor(this.scrollBox.viewport.height / 2))
    this.scrollBox.scrollBy(delta * half)
    for (let i = 0; i < half && this.step(delta); i++) {}
  }

  /** `gg`: the description's header, with the lines above it in view. */
  jumpToTop(): void {
    this.flashJump(ALL_SECTIONS[0]!)
    this.scrollBox.scrollTo(0)
  }

  /** `G`: the last row of the last section, or its header if it is folded. */
  jumpToBottom(): void {
    const last = ALL_SECTIONS[ALL_SECTIONS.length - 1]!
    const rows = this.expandedSections.has(last) ? this.getItemCountForSection(last) : 0
    this.flashJump(rows > 0 ? `${last}:${rows - 1}` : last)
  }

  private followCursor(): void {
    this.placeDescriptionCursor()
    this.revealPending = true
    this.renderer.requestRender()
  }

  /** Where the cursor row is on screen, and how tall. */
  private cursorBounds(): { y: number; height: number } | null {
    if (this.cursorIndex === -1) {
      const box = this.sectionBoxes[ALL_SECTIONS.indexOf(this.activeSection)]
      const header = box?.getChildren()[0]
      return header ? { y: header.y, height: 1 } : null
    }
    if (this.activeSection === 'description') {
      const box = this.descriptionBox
      if (!box || box.height === 0) return null
      return { y: box.y + Math.min(this.cursorIndex, box.height - 1), height: 1 }
    }
    const row = isListSection(this.activeSection)
      ? this.listIslands.get(this.activeSection)?.rowAt(this.cursorIndex)
      : this.itemRows.get(this.activeSection)?.[this.cursorIndex]?.container
    return row ? { y: row.y, height: Math.max(1, row.height) } : null
  }

  /**
   * Scroll just enough to keep the cursor row `CURSOR_SCROLL_OFF` rows off
   * the edges, and say whether it scrolled. Runs from the scroll box's own
   * render, after layout, so a row the move just rebuilt is measured where
   * it now is.
   */
  private revealCursor(): boolean {
    const bounds = this.cursorBounds()
    if (!bounds) return false

    const viewport = this.scrollBox.viewport
    const off = Math.min(CURSOR_SCROLL_OFF, Math.floor((viewport.height - 1) / 2))
    const top = bounds.y - viewport.y
    // A row taller than the room between the margins shows its top.
    const bottom = top + Math.min(bounds.height, viewport.height - 2 * off)

    const before = this.scrollBox.scrollTop
    if (top < off) {
      this.scrollBox.scrollBy(top - off)
    } else if (bottom > viewport.height - off) {
      this.scrollBox.scrollBy(bottom - (viewport.height - off))
    }
    return this.scrollBox.scrollTop !== before
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
    this.followCursor()
  }

  private get visibleFiles(): DiffFile[] {
    return visibleFiles(this.files, this.filter)
  }

  private get visiblePreviews(): PreviewRow[] {
    return visiblePreviews(this.previews?.rows ?? [], this.filter)
  }

  private get visibleCommits(): PrCommit[] {
    return visibleCommits(this.prInfo.commits ?? [], this.filter)
  }

  /**
   * Narrow the panel to rows containing this text, or clear it with "".
   * A filter opens every section it matches in: hiding the matches inside
   * a collapsed header would make the filter look broken.
   */
  setFilter(filter: string): void {
    if (filter === this.filter) return
    this.filter = filter
    this.refreshFlatItems()
    this.refreshFlatCheckItems()
    if (filter) {
      for (const section of ALL_SECTIONS) {
        if (section === 'description') continue
        if (this.getItemCountForSection(section) > 0) this.expandedSections.add(section)
      }
    }
    this.cursorIndex = Math.min(this.cursorIndex, this.getMaxCursorIndex())
    this.rebuildSections()
  }

  getFilter(): string {
    return this.filter
  }

  /** Where the filter box sends what is typed. Set once, from app.ts. */
  setOnFilterChange(callback: (value: string) => void): void {
    this.onFilterChange = callback
  }

  /**
   * Show or hide the filter prompt. Focus is taken on the way in only, so a
   * re-render mid-typing does not reset the cursor, and the field is seeded
   * from the live filter — reopening refines rather than restarts.
   */
  syncFilterInput(open: boolean, filter: string): void {
    if (open === this.filterFocused) return
    this.filterFocused = open
    if (this.filterRow) this.filterRow.visible = open

    if (open) {
      this.filterInput.value = filter
      this.filterInput.focus()
    } else {
      this.filterInput.blur()
    }
  }

  /**
   * Get item count for a specific section
   */
  private getItemCountForSection(section: PRInfoPanelSection): number {
    switch (section) {
      case 'description':
        // Read like a buffer: its items are the rows it renders to.
        return this.descriptionBox?.height ?? 0
      case 'checks':
        return this.flatCheckItems.length
      case 'conversation':
        return this.flatConversationItems.length
      case 'files':
        return this.visibleFiles.length
      case 'commits':
        return this.visibleCommits.length
      case 'previews':
        return this.visiblePreviews.length
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
    this.followCursor()
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

  /** Whether a named section is open, whichever one has the cursor. */
  isSectionExpandedNamed(section: PRInfoPanelSection): boolean {
    return this.expandedSections.has(section)
  }

  /**
   * Get selected commit
   */
  getSelectedCommit(): PrCommit | undefined {
    if (this.activeSection !== 'commits' || this.cursorIndex < 0) return undefined
    return this.visibleCommits[this.cursorIndex]
  }

  /**
   * Get selected file
   */
  getSelectedFile(): DiffFile | undefined {
    if (this.activeSection !== 'files' || this.cursorIndex < 0) return undefined
    return this.visibleFiles[this.cursorIndex]
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
   * Toggle expand/collapse for the selected conversation item.
   * - For PR comments: toggles full body display
   * - For reviews: toggles threads visibility (flattens them as navigable items)
   */
  toggleSelectedThread(): void {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return
    
    const itemId = flatConversationItemId(flatItem)
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
    const itemId = flatConversationItemId(flatItem)
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
    const itemId = flatConversationItemId(flatItem)
    if (this.expandedContent.has(itemId)) {
      this.expandedContent.delete(itemId)
      this.refreshFlatItems()
      this.rebuildSections()
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
   * Update a row's visual state
   */
  private updateItemRow(section: PRInfoPanelSection, index: number, selected: boolean): void {
    const rows = this.itemRows.get(section)
    const row = rows?.[index]
    if (!row) return

    row.container.backgroundColor = selected ? theme.surface0 : undefined
    
    // Update colors based on section type
    switch (section) {
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
   * Fresh PR data for the panel to draw from.
   *
   * The panel takes `prInfo` in its constructor and every section reads
   * that copy, so anything that changes it in app state — a reaction on the
   * body, on a conversation comment or on a review (spec 042) — is
   * invisible here until it is handed over.
   */
  setPrInfo(prInfo: PrInfo): void {
    if (prInfo === this.prInfo) return
    this.prInfo = prInfo
    this.conversationItems = conversationItems(this.prInfo, this.comments, this.hiddenConversationIds)
    this.refreshFlatItems()
    this.refreshFlatCheckItems()
    this.cursorIndex = Math.min(this.cursorIndex, this.getMaxCursorIndex())
    this.rebuildSections()
  }

  /** What this PR is stacked on, and how that base has moved (spec 072). */
  setStack(stack: StackInfo | null): void {
    if (!this.stackText) return
    this.stackText.content = stack ? stackText(stack) : ""
    this.stackText.fg = stack?.status === "rewritten" ? theme.yellow : theme.subtext0
    this.stackText.visible = stack !== null
  }

  /** The links riff was given for this PR, and where they came from. */
  setPreviews(previews: PreviewSet | null): void {
    if (previews === this.previews) return
    this.previews = previews
    this.cursorIndex = Math.min(this.cursorIndex, this.getMaxCursorIndex())
    this.rebuildSections()
  }

  /** The row the cursor is on, when it is on one (spec 068). */
  getSelectedPreview(): PreviewRow | undefined {
    if (this.activeSection !== 'previews' || this.cursorIndex < 0) return undefined
    return this.visiblePreviews[this.cursorIndex]
  }

  /**
   * Rebuild just the sections container
   */
  private rebuildSections(): void {
    if (!this.sectionsContainer) return
    
    for (const box of this.sectionBoxes) {
      discard(box)
    }
    this.sectionBoxes = []
    this.itemRows.clear()
    this.descriptionBox = null
    this.descriptionCursorRow = null

    // Rebuild
    this.buildSections(this.sectionsContainer)
    this.applyFlashLabels()
  }

  /**
   * Every row `s` can jump to: the five section headers, plus the rows of
   * the sections that are open (spec 066). Ids are the panel's own.
   */
  flashTargets(): string[] {
    const ids: string[] = []
    for (const section of ALL_SECTIONS) {
      ids.push(section)
      // A label per line of prose would bury the ones worth jumping to.
      if (!this.expandedSections.has(section) || section === 'description') continue
      const count = this.getItemCountForSection(section)
      for (let i = 0; i < count; i++) ids.push(`${section}:${i}`)
    }
    return ids
  }

  /**
   * Where `gx` looks for links: everything the panel is showing, the row
   * the cursor is on first (spec 077).
   *
   * Most sources are text to read links out of. A preview row is the
   * exception — its links were lifted out of a table and are already a
   * list, the build's own run included, which `Enter` and `y` never reach
   * (spec 068).
   */
  linkSources(): LinkSource[] {
    const focused = this.focusedSource()
    const all: LinkSource[] = [{ title: "Description", text: this.prInfo.body ?? "" }]

    for (const row of this.visiblePreviews) all.push(this.previewSource(row))
    for (const item of this.flatConversationItems) {
      if (item.type === 'pending-reviewer') continue
      all.push({ title: `@${item.data.author}`, text: item.data.body ?? "" })
    }
    // A green run is not a place anyone goes, and a monorepo has fifty of
    // them — a failing one is. The check under the cursor is `focused`.
    for (const check of this.prInfo.checks ?? []) {
      if (check.detailsUrl && isFailingCheck(check)) all.push({ title: check.name, text: check.detailsUrl })
    }
    for (const commit of this.visibleCommits) {
      all.push({ title: commit.sha.slice(0, 7), text: commit.message })
    }

    // The duplicate the focused source makes is dropped on the way out:
    // collection keeps the first row for a URL, which is this one.
    return focused ? [focused, ...all] : all
  }

  private previewSource(row: PreviewRow): LinkSource {
    const built = row.built ? [{ label: row.built.label, url: row.built.url, detail: "built" }] : []
    return { title: row.app, links: [...row.links, ...built] }
  }

  private focusedSource(): LinkSource | null {
    switch (this.activeSection) {
      case 'description':
        return { title: "Description", text: this.prInfo.body ?? "" }
      case 'conversation': {
        const item = this.flatConversationItems[this.cursorIndex]
        if (!item) return { title: "Conversation", text: this.conversationText() }
        if (item.type === 'pending-reviewer') return null
        return { title: `@${item.data.author}`, text: item.data.body ?? "" }
      }
      case 'commits': {
        const commit = this.visibleCommits[this.cursorIndex]
        return commit ? { title: commit.sha.slice(0, 7), text: commit.message } : null
      }
      case 'checks': {
        const item = this.flatCheckItems[this.cursorIndex]
        if (!item) return null
        const url = item.kind === 'annotation' ? item.annotation.message : item.check.detailsUrl
        return url ? { title: item.check.name, text: url } : null
      }
      case 'previews': {
        const row = this.visiblePreviews[this.cursorIndex]
        return row ? this.previewSource(row) : null
      }
      default:
        return null
    }
  }

  /** Every word of the conversation, for when the cursor is on its header. */
  private conversationText(): string {
    return this.flatConversationItems
      .map((item) => (item.type === 'pending-reviewer' ? "" : (item.data.body ?? "")))
      .join("\n\n")
  }

  /** Put the cursor on the row a label picked. */
  flashJump(id: string): void {
    const [name, index] = id.split(":")
    const section = ALL_SECTIONS.find((candidate) => candidate === name)
    if (!section) return

    this.setActiveSection(section)
    this.activeSection = section
    this.cursorIndex = index === undefined ? -1 : Math.min(Number(index), this.getMaxCursorIndex())
    this.rebuildSections()
    this.followCursor()
  }

  /**
   * Comments a section of its own now speaks for. They are folded out of
   * Conversation, whose header says how many (specs 067, 068).
   */
  setHiddenConversation(ids: ReadonlySet<string>): void {
    if (ids.size === this.hiddenConversationIds.size) {
      let same = true
      for (const id of ids) if (!this.hiddenConversationIds.has(id)) same = false
      if (same) return
    }
    this.hiddenConversationIds = ids
    this.conversationItems = conversationItems(this.prInfo, this.comments, this.hiddenConversationIds)
    this.refreshFlatItems()
    this.rebuildSections()
  }

  /** Show or hide the labels. */
  setFlashLabels(labels: ReadonlyMap<string, string>): void {
    this.flashLabels = labels
    this.rebuildSections()
  }

  /**
   * Paint the labels onto the rows the section builders have already made —
   * one pass over the refs they leave behind, rather than a branch in each
   * of them. The label goes in front of the row, so nothing it says is lost.
   */
  private applyFlashLabels(): void {
    if (this.flashLabels.size === 0) return

    for (const [section, rows] of this.itemRows) {
      rows.forEach((row, index) => {
        const label = this.flashLabels.get(`${section}:${index}`)
        if (!label) return
        row.container.add(
          new TextRenderable(this.renderer, { content: `${label} `, fg: colors.flashLabel }),
          0
        )
      })
    }
  }

  /**
   * Check if a section has selectable items
   */
  private sectionHasItems(section: PRInfoPanelSection): boolean {
    return section !== 'description'
  }

  /**
   * Build the sections content
   */
  private buildSections(container: BoxRenderable): void {
    this.bodies.begin()
    const configs = sectionConfigs({
      prInfo: this.prInfo,
      files: this.files,
      previews: this.previews,
      conversationItems: this.conversationItems,
      hiddenConversationIds: this.hiddenConversationIds,
      filter: this.filter,
    })
    
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
      const headerLabel = this.flashLabels.get(config.id)
      if (headerLabel) {
        headerRow.add(new TextRenderable(this.renderer, {
          content: `${headerLabel} `,
          fg: colors.flashLabel,
        }))
      }
      headerRow.add(new TextRenderable(this.renderer, {
        content: `${indicator}  ${config.title} (${config.count}${config.countSuffix ?? ""})`,
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

    this.bodies.end()
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
      case 'previews':
      case 'files':
      case 'commits':
        contentBox.add(this.listIsland(section, isActive).host)
        break
      case 'checks':
        this.buildChecksContent(contentBox, isActive)
        break
      case 'conversation':
        this.buildConversationContent(contentBox, isActive)
        break
    }
    
    container.add(contentBox)
  }

  /** The section's island, made on first use, holding the rows as they are now. */
  private listIsland(section: ListSection, isActive: boolean): PrInfoListIsland {
    let island = this.listIslands.get(section)
    if (!island) {
      island = createPrInfoListIsland(this.renderer, { id: `pr-info-${section}` })
      this.listIslands.set(section, island)
    }
    island.update(this.listRows(section, isActive))
    return island
  }

  /** A cursor move inside a list section restyles its rows without a rebuild. */
  private pushListRows(section: PRInfoPanelSection): void {
    if (!isListSection(section)) return
    this.listIslands.get(section)?.update(this.listRows(section, section === this.activeSection))
  }

  private listRows(section: ListSection, isActive: boolean): ListRows {
    const input = { selected: isActive ? this.cursorIndex : -1, labels: this.flashLabels }
    switch (section) {
      case 'previews':
        return previewRows(this.visiblePreviews, input)
      case 'files':
        return fileRows(this.visibleFiles, { ...input, listWidth: getListItemWidth() })
      case 'commits':
        return commitRows(this.visibleCommits, { ...input, terminalWidth: getTerminalWidth() })
    }
  }

  /**
   * Build full description content (markdown)
   */
  private buildDescriptionContent(container: BoxRenderable): void {
    this.descriptionBox = container
    // First, so the text after it draws over it and keeps its colours: paint
    // hooks cannot read the cells a highlight would have to repaint.
    this.descriptionCursorRow = new BoxRenderable(this.renderer, {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: 1,
      backgroundColor: DESCRIPTION_CURSOR_BG,
      visible: false,
    })
    container.add(this.descriptionCursorRow)
    container.onSizeChange = () => this.placeDescriptionCursor()

    if (!this.prInfo.body?.trim()) {
      container.add(new TextRenderable(this.renderer, {
        content: "No description provided",
        fg: theme.overlay0,
      }))
    } else {
      const body = extractCommentImages(this.prInfo.body)
      if (body.text) {
        container.add(this.markdownBody("pr-info-description", body.text))
      }
      this.appendImageRows(container, body.images, 0)
    }
    this.appendReactionRow(container, this.prInfo.bodyReactions)
  }

  /**
   * Put the description's cursor row under the line the cursor is on. A
   * description that only laid out after the cursor was put in it (a
   * refresh) may be shorter than the row it names, so the last line stands
   * in for it.
   */
  private placeDescriptionCursor(): void {
    const box = this.descriptionBox
    const row = this.descriptionCursorRow
    if (!box || !row) return
    const line = Math.min(this.cursorIndex, box.height - 1)
    const shown = this.activeSection === 'description' && this.cursorIndex >= 0 && line >= 0
    if (shown) row.top = line
    row.visible = shown
  }

  /**
   * Append the row's relative timestamp. Every conversation row ends with
   * this column so the times form a single right-aligned strip down the
   * section; the preceding flex-grown body is what pushes it to the edge.
   */
  private addTimeColumn(row: BoxRenderable, isoDate: string): void {
    row.add(new TextRenderable(this.renderer, {
      content: `  ${formatTimeAgo(isoDate).padStart(TIME_COLUMN_WIDTH)}`,
      fg: theme.overlay0,
      flexShrink: 0,
    }))
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
    const { icon, color } = getCheckStatusDisplay(check)
    const expandable = isFailingCheck(check)
    const expanded = this.expandedCheckIds.has(check.id)

    const row = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 1,
      backgroundColor: isSelected ? theme.surface0 : undefined,
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
      backgroundColor: isSelected ? theme.surface0 : undefined,
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
      backgroundColor: isSelected ? theme.surface0 : undefined,
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
          backgroundColor: isSelected ? theme.surface0 : undefined,
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

        this.addTimeColumn(row, comment.createdAt)

        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })

        if (isExpanded) {
          this.buildExpandedCommentBody(container, `pr-comment-${comment.id}`, comment.body, 4)
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
          backgroundColor: isSelected ? theme.surface0 : undefined,
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
          this.addTimeColumn(row, review.submittedAt)
        }

        container.add(row)
        rows.push({ container: row, primary: authorText, secondary: bodyText })
        
        // Show review body if expanded (but threads are separate items now)
        if (isExpanded && hasBody) {
          this.buildExpandedCommentBody(container, `review-${review.id}`, review.body!, 4)
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
          backgroundColor: isSelected ? theme.surface0 : undefined,
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

        this.addTimeColumn(row, threadActivityAt(thread))

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
          this.buildExpandedCommentBody(container, `thread-${thread.id}`, thread.body, 6)
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
              flexShrink: 0,
            }))
            replyHeader.add(new TextRenderable(this.renderer, {
              content: "",
              flexGrow: 1,
              flexShrink: 1,
            }))
            this.addTimeColumn(replyHeader, reply.createdAt)
            container.add(replyHeader)

            this.buildExpandedCommentBody(container, `reply-${reply.id}`, reply.body, 8)
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
          backgroundColor: isSelected ? theme.surface0 : undefined,
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
  private buildExpandedCommentBody(container: BoxRenderable, id: string, body: string, indent: number): void {
    const bodyBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      paddingLeft: indent,
      paddingRight: 2,
      marginTop: 1,
      marginBottom: 1,
    })

    const parsed = extractCommentImages(body)
    if (parsed.text) {
      bodyBox.add(this.markdownBody(id, parsed.text))
    }
    this.appendImageRows(bodyBox, parsed.images, 0)

    container.add(bodyBox)
  }

  /**
   * A body from the pool — one renderable per id, alive across the
   * rebuilds this panel does on almost every keypress.
   */
  private markdownBody(id: string, text: string): MarkdownRenderable {
    return this.bodies.mount(id, withReferences(softenCommentHtml(text)), {
      renderNode: tableRenderer(this.renderer, () => this.markdownWidth()),
      syntaxStyle: getSyntaxStyle(this.renderer.nativeScene),
    })
  }

  /**
   * Name the pictures the body carried. The panel can't draw them, and the
   * raw `<img>` HTML GitHub pastes in reads as a wall of attributes; the
   * section's Enter binding already opens the item on github.com, which is
   * where the image can actually be looked at.
   */
  private appendImageRows(
    container: BoxRenderable,
    images: readonly CommentImage[],
    indent: number
  ): void {
    for (const image of images) {
      container.add(new TextRenderable(this.renderer, {
        content: `${" ".repeat(indent)}▣ ${image.label}`,
        fg: theme.sapphire,
      }))
    }
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
    this.buildExpandedCommentBody(container, `thread-${thread.id}`, thread.body, indent + 2)
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

      this.buildExpandedCommentBody(container, `reply-${reply.id}`, reply.body, indent + 4)
      this.appendReactionRow(container, reply.reactions, indent + 4)
    }
  }

  /**
   * Build the panel
   */
  private build(): { container: BoxRenderable; scrollBox: ScrollBoxRenderable } {
    const prInfo = this.prInfo

    // Main container — inline flex child of the main content row (spec 041,
    // previously an absolute overlay).
    const container = new BoxRenderable(this.renderer, {
      id: "pr-info-panel",
      flexGrow: 1,
      height: "100%",
      flexDirection: "column",
      backgroundColor: theme.base,
    })

    // The `Ctrl-f` prompt (spec 065). Hidden until it is opened, and a real
    // input widget so word deletion, paste and the rest come from OpenTUI.
    const filterRow = new BoxRenderable(this.renderer, {
      id: "pr-info-filter-row",
      height: 1,
      width: "100%",
      flexDirection: "row",
      paddingLeft: 2,
      visible: false,
    })
    filterRow.add(new TextRenderable(this.renderer, { content: "/", fg: colors.secondary }))
    filterRow.add(this.filterInput)
    container.add(filterRow)
    this.filterRow = filterRow

    // Scroll box
    const scrollBox = new ScrollBoxRenderable(this.renderer, {
      id: "pr-info-scroll",
      flexGrow: 1,
      width: "100%",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      scrollY: true,
      // The first point a frame has the rows a move rebuilt laid out. A
      // scroll made here only reaches the next frame, so it asks for one.
      renderBefore: () => {
        if (!this.revealPending) return
        this.revealPending = false
        if (this.revealCursor()) this.renderer.requestRender()
      },
    })
    container.add(scrollBox)

    // Content container inside scroll box
    const content = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      width: "100%",
    })
    scrollBox.add(content)

    // What the header line does not already say (spec 067). The title, the
    // status, the change counts and the review state are all up there or in
    // the sections below; repeating them spent five rows saying nothing and
    // pushed the sections off the first screen.
    const metaRow = new BoxRenderable(this.renderer, {
      flexDirection: "row",
      height: 1,
      width: "100%",
    })
    metaRow.add(new TextRenderable(this.renderer, { content: `@${prInfo.author}`, fg: theme.blue }))
    metaRow.add(new TextRenderable(this.renderer, { content: "  ", fg: theme.overlay0 }))
    metaRow.add(new TextRenderable(this.renderer, {
      content: `${prInfo.headRef} → ${prInfo.baseRef}`,
      fg: theme.subtext0,
    }))
    // Who has approved — the one review state that decides whether this
    // can merge, and the header line only carries the checks.
    // A later review from the same person supersedes an earlier one: an
    // approval followed by "changes requested" is not an approval.
    const latestByAuthor = new Map<string, PrReview>()
    for (const review of [...(prInfo.reviews ?? [])].sort((a, b) =>
      (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")
    )) {
      if (review.state !== "COMMENTED" && review.state !== "PENDING") latestByAuthor.set(review.author, review)
    }
    const approvers = [...latestByAuthor.values()]
      .filter((review) => review.state === "APPROVED")
      .map((review) => review.author)
    if (approvers.length > 0) {
      metaRow.add(new TextRenderable(this.renderer, {
        content: `   ✓ ${approvers.map((name) => `@${name}`).join(" ")}`,
        fg: theme.green,
      }))
    }
    content.add(metaRow)

    // Stacked on another PR (spec 072): known a moment after the panel is,
    // so the row is here from the start and says nothing until then.
    this.stackText = new TextRenderable(this.renderer, { content: "", fg: theme.subtext0 })
    content.add(this.stackText)

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

    return { container, scrollBox }
  }

  /**
   * Update comment input overlay
   */
  updateCommentInput(open: boolean, text: string, loading: boolean, error: string | null): void {
    if (!open) {
      // Remove overlay if it exists
      if (this.commentInputOverlay) {
        discard(this.commentInputOverlay)
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
        paddingX: 2,
        paddingY: 1,
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
      const textBox = new BoxRenderable(this.renderer, {
        id: "pr-comment-input-text-box",
        backgroundColor: theme.surface0,
        paddingX: 1,
      })
      textBox.add(this.commentInputText)
      inputBox.add(textBox)
      
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
    this.bodies.destroy()
    for (const island of this.listIslands.values()) island.dispose()
    this.listIslands.clear()
    this.container.parent?.remove(this.container)
    this.container.destroyRecursively()
  }
}
