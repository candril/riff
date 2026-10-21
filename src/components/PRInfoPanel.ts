/**
 * PR Info Panel v2 - Section-based navigation
 * Shows PR metadata with collapsible sections navigated via Tab/j/k
 */

import {
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  SyntaxStyle,
  type NativeResourceOwner,
  RGBA,
  type CliRenderer,
} from "@opentui/core"
import type { PrInfo, PrCommit, PrCheck, PrCheckAnnotation } from "../providers/github"
import { discard, keepAlive } from "../utils/renderables"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow, PreviewSet } from "../utils/previews"
import type { LinkSource } from "../utils/link-targets"
import type { StackInfo } from "../utils/stack"
import type { Comment, ReactionTarget } from "../types"
import type { PRInfoPanelSection } from "../state"
import { tableRenderer } from "./markdown-tables-in-markdown"
import { colors, theme } from "../theme"
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
} from "./pr-info-items"
import { sectionConfigs } from "./pr-info-sections"
import { panelMeta, sectionHeaderRow, stackLine, type SectionHeaderRow } from "./pr-info-header"
import { commitRowCount, commitRows, fileRows, previewRows, type ListRows } from "./pr-info-list-rows"
import { checkRows } from "./pr-info-check-rows"
import { fileDiffContext } from "./pr-info-conversation-parts"
import { conversationRows, type ConversationRows } from "./pr-info-conversation-rows"
import { createPrInfoListIsland, type PrInfoListIsland } from "../app/pr-info-lists"
import { createPrInfoConversationIsland, type PrInfoConversationIsland } from "../app/pr-info-conversation"
import { createPrInfoDescriptionIsland, type PrInfoDescriptionIsland } from "../app/pr-info-description"
import { descriptionModel, type DescriptionModel } from "./pr-info-description"
import {
  createPrInfoHeaderIsland,
  createPrInfoMetaIsland,
  type PrInfoHeaderIsland,
  type PrInfoMetaIsland,
} from "../app/pr-info-header"
import { createPrCommentPromptIsland, type PrCommentPromptIsland } from "../app/pr-comment-prompt"
import { prCommentPromptModel } from "./pr-comment-prompt"
import * as Nav from "./pr-info-nav"
import type { PrInfoNav } from "./pr-info-nav"

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
 * Get terminal width (defaults to 80 if unavailable)
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80
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

type ListSection = 'previews' | 'checks' | 'files' | 'commits'

function isListSection(section: PRInfoPanelSection): section is ListSection {
  return section === 'previews' || section === 'checks' || section === 'files' || section === 'commits'
}

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
  private container: BoxRenderable
  private scrollBox: ScrollBoxRenderable
  private prInfo: PrInfo
  private files: DiffFile[]
  private comments: Comment[]
  
  private nav: PrInfoNav = Nav.initialNav()
  private readonly counts: Nav.SectionCounts = (section) => this.getItemCountForSection(section)

  private filterInput: InputRenderable
  private filterRow: BoxRenderable | null = null
  private filterFocused: boolean = false
  private onFilterChange: ((value: string) => void) | null = null

  // Conversation items (computed from prInfo + comments)
  private conversationItems: ConversationItem[] = []

  // Comments another section now speaks for — the deploy bot's preview
  // table, say (specs 067, 068). Folded away here, never dropped.
  private hiddenConversationIds: ReadonlySet<string> = new Set()

  // Preview links lifted out of a deploy bot's table (spec 068).
  private previews: PreviewSet | null = null

  // What this PR is stacked on (spec 072); undefined until it is known.
  private stack: StackInfo | null | undefined = undefined
  
  // Flattened items cache (includes expanded review threads as separate items)
  private flatConversationItems: FlatConversationItem[] = []

  private flatCheckItems: FlatCheckItem[] = []
  // Where a failing check asks for its annotations; the app fetches them (set by app.ts).
  private onOpenFailingCheck: ((check: PrCheck) => void) | null = null
  
  // Section containers (for rebuilding on section change)
  private sectionsContainer: BoxRenderable | null = null
  private sectionBoxes: BoxRenderable[] = []
  private descriptionBox: BoxRenderable | null = null
  // Set when the cursor moved; the next frame scrolls it into view, once
  // layout has placed whatever the move rebuilt.
  private revealPending = false
  // Where a restored position had scrolled to. A panel restored before its
  // first layout would clamp it to 0, so the first frame applies it.
  private pendingScrollTop: number | null = null
  
  // Made the first time their section opens, and mounted into each rebuild's
  // section box from then on.
  private listIslands: Map<ListSection, PrInfoListIsland> = new Map()
  private conversation: PrInfoConversationIsland | null = null
  private description: PrInfoDescriptionIsland | null = null
  // A new body is only measured by the next layout, so the cursor that was
  // in the old one is taken back onto the new one's last line from there.
  private clampDescriptionOnResize = false
  private headerIslands: Map<PRInfoPanelSection, PrInfoHeaderIsland> = new Map()
  private meta: PrInfoMetaIsland | null = null

  // Flash labels by row id, while `s` is labelling (spec 066).
  private flashLabels: ReadonlyMap<string, string> = new Map()
  
  private commentPrompt: PrCommentPromptIsland

  constructor(renderer: CliRenderer, prInfo: PrInfo, files: DiffFile[] = [], comments: Comment[] = []) {
    this.renderer = renderer
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

    this.commentPrompt = createPrCommentPromptIsland(renderer)
    
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
    return this.nav.activeSection
  }

  /**
   * Where the reader is in the panel. Refreshed PR data means a new panel
   * instance (the old one caches prInfo, files and comments), so the two
   * halves of this pair are what carries the reader across it (spec 063).
   */
  capturePosition(): PRInfoPanelPosition {
    return {
      activeSection: this.nav.activeSection,
      cursorIndex: this.nav.cursorIndex,
      expandedSections: new Set(this.nav.expandedSections),
      expandedThreads: new Set(this.nav.expandedThreads),
      expandedContent: new Set(this.nav.expandedContent),
      expandedCheckIds: new Set(this.nav.expandedCheckIds),
      // A panel rebuilt again before its first frame has not applied its
      // restored scroll yet; the box still reads 0.
      scrollTop: this.pendingScrollTop ?? this.scrollBox.scrollTop,
    }
  }

  restorePosition(position: PRInfoPanelPosition): void {
    const restored: PrInfoNav = {
      activeSection: position.activeSection,
      cursorIndex: position.cursorIndex,
      expandedSections: new Set(position.expandedSections),
      expandedThreads: new Set(position.expandedThreads),
      expandedContent: new Set(position.expandedContent),
      expandedCheckIds: new Set(position.expandedCheckIds),
      filter: this.nav.filter,
    }
    // The section can have fewer items than it had — a review that was
    // resolved away, a check that finished and folded its annotations.
    this.refreshFlatItems(restored)
    this.refreshFlatCheckItems(restored)
    this.nav = Nav.restoreNav(restored, this.counts)

    this.rebuildSections()
    // Where the reader had scrolled to wins over a reveal asked for before
    // the restore: the cursor was in view there when it was captured.
    this.revealPending = false
    this.pendingScrollTop = position.scrollTop
  }

  /**
   * Get the current cursor index
   */
  getCursorIndex(): number {
    return this.nav.cursorIndex
  }

  /**
   * Check if cursor is on section header (index -1)
   */
  isOnSectionHeader(): boolean {
    return this.nav.cursorIndex === -1
  }

  /** What a reaction lands on from where the cursor is (spec 042). */
  getReactionTarget(): ReactionTarget | null {
    return Nav.reactionTargetOf(this.getSelectedFlatItem(), this.nav.activeSection, this.prInfo.number)
  }

  /**
   * Get the max cursor index for the current section
   * -1 = section header, 0+ = items
   */
  getMaxCursorIndex(): number {
    return Nav.maxCursorIndex(this.nav, this.counts)
  }

  private refreshFlatItems(nav: PrInfoNav = this.nav): void {
    this.flatConversationItems = flatConversationItems(this.conversationItems, nav.filter, nav.expandedContent)
  }

  private refreshFlatCheckItems(nav: PrInfoNav = this.nav): void {
    this.flatCheckItems = flatCheckItems(this.prInfo.checks, nav.expandedCheckIds, nav.filter)
  }

  /**
   * Move cursor within current section
   * Returns true if cursor moved, false if at boundary
   * Cursor -1 = section header, 0+ = items
   */
  moveCursor(delta: number): boolean {
    return this.moveTo(Nav.moveCursor(this.nav, delta, this.counts))
  }

  private moveTo(next: PrInfoNav): boolean {
    if (next === this.nav) return false
    const before = this.nav
    this.nav = next
    this.pushRows(next.activeSection)
    if (Nav.crossedHeader(before, next)) this.rebuildSections()
    this.followCursor()
    return true
  }

  /**
   * One row down or up — within the section, else across into the next
   * one. False at either end of the panel: like a buffer, it does not wrap.
   */
  step(delta: 1 | -1): boolean {
    const next = Nav.stepNav(this.nav, delta, this.counts)
    if (!next) return false
    if (next.activeSection === this.nav.activeSection) return this.moveTo(next)
    this.applySection(next)
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
    this.flashJump(Nav.bottomTarget(this.nav, this.counts))
  }

  private followCursor(): void {
    this.pendingScrollTop = null
    this.revealPending = true
    this.renderer.requestRender()
  }

  /** Where the cursor row is on screen, and how tall. */
  private cursorBounds(): { y: number; height: number } | null {
    if (this.nav.cursorIndex === -1) {
      const box = this.sectionBoxes[ALL_SECTIONS.indexOf(this.nav.activeSection)]
      const header = box?.getChildren()[0]
      return header ? { y: header.y, height: 1 } : null
    }
    if (this.nav.activeSection === 'description') {
      const box = this.descriptionBox
      if (!box || box.height === 0) return null
      return { y: box.y + Math.min(this.nav.cursorIndex, box.height - 1), height: 1 }
    }
    const row = isListSection(this.nav.activeSection)
      ? this.listIslands.get(this.nav.activeSection)?.rowAt(this.nav.cursorIndex)
      : this.conversation?.rowAt(this.nav.cursorIndex)
    return row ? { y: row.y, height: Math.max(1, row.height) } : null
  }

  /**
   * Scroll just enough to keep the cursor row `CURSOR_SCROLL_OFF` rows off
   * the edges. Runs from the scroll box's own render, after layout, so a
   * row the move just rebuilt is measured where it now is.
   */
  private revealCursor(): void {
    const bounds = this.cursorBounds()
    if (!bounds) return

    const viewport = this.scrollBox.viewport
    const off = Math.min(CURSOR_SCROLL_OFF, Math.floor((viewport.height - 1) / 2))
    const top = bounds.y - viewport.y
    // A row taller than the room between the margins shows its top.
    const bottom = top + Math.min(bounds.height, viewport.height - 2 * off)

    if (top < off) {
      this.scrollBox.scrollBy(top - off)
    } else if (bottom > viewport.height - off) {
      this.scrollBox.scrollBy(bottom - (viewport.height - off))
    }
  }

  /**
   * Cycle to next/previous section (Tab navigation)
   * Positions cursor at section header (-1)
   */
  cycleSection(delta: number): void {
    this.applySection(Nav.cycleSection(this.nav, delta))
  }

  /**
   * Cycle to next/previous section, positioning cursor at end if expanded
   * Used when navigating up from a section header
   */
  cycleSectionToEnd(delta: number): void {
    this.applySection(Nav.cycleSectionToEnd(this.nav, delta, this.counts))
  }

  private get visibleFiles(): DiffFile[] {
    return visibleFiles(this.files, this.nav.filter)
  }

  private get visiblePreviews(): PreviewRow[] {
    return visiblePreviews(this.previews?.rows ?? [], this.nav.filter)
  }

  private get visibleCommits(): PrCommit[] {
    return visibleCommits(this.prInfo.commits ?? [], this.nav.filter)
  }

  /** Narrow the panel to rows containing this text, or clear it with "". */
  setFilter(filter: string): void {
    if (filter === this.nav.filter) return
    const filtered = { ...this.nav, filter }
    this.refreshFlatItems(filtered)
    this.refreshFlatCheckItems(filtered)
    this.nav = Nav.setFilter(this.nav, filter, (section) => this.getItemCountForSection(section, filtered))
    this.rebuildSections()
  }

  getFilter(): string {
    return this.nav.filter
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
  private getItemCountForSection(section: PRInfoPanelSection, nav: PrInfoNav = this.nav): number {
    switch (section) {
      case 'description':
        // Read like a buffer: its items are the rows it renders to.
        return this.descriptionBox?.height ?? 0
      case 'checks':
        return this.flatCheckItems.length
      case 'conversation':
        return this.flatConversationItems.length
      case 'files':
        return visibleFiles(this.files, nav.filter).length
      case 'commits':
        return commitRowCount(visibleCommits(this.prInfo.commits ?? [], nav.filter))
      case 'previews':
        return visiblePreviews(this.previews?.rows ?? [], nav.filter).length
    }
  }

  /**
   * Set the active section
   */
  setActiveSection(section: PRInfoPanelSection): void {
    this.applySection(Nav.setActiveSection(this.nav, section))
  }

  private applySection(next: PrInfoNav): void {
    if (next === this.nav) return
    this.nav = next
    this.rebuildSections()
    this.followCursor()
  }

  /**
   * Toggle expand/collapse for the active section (za)
   */
  toggleSection(): void {
    this.nav = Nav.toggleSection(this.nav)
    this.rebuildSections()
  }

  /**
   * Collapse the active section (zm)
   */
  collapseSection(): void {
    this.nav = Nav.collapseSection(this.nav)
    this.rebuildSections()
  }

  /**
   * Expand the active section (zr)
   */
  expandSection(): void {
    this.nav = Nav.expandSection(this.nav)
    this.rebuildSections()
  }

  /**
   * Collapse all sections (zM)
   */
  collapseAllSections(): void {
    this.nav = Nav.collapseAll(this.nav)
    this.rebuildSections()
  }

  /**
   * Expand all sections (zR)
   */
  expandAllSections(): void {
    this.nav = Nav.expandAll(this.nav)
    this.rebuildSections()
  }

  /**
   * Check if active section is expanded
   */
  isSectionExpanded(): boolean {
    return this.nav.expandedSections.has(this.nav.activeSection)
  }

  /** Whether a named section is open, whichever one has the cursor. */
  isSectionExpandedNamed(section: PRInfoPanelSection): boolean {
    return this.nav.expandedSections.has(section)
  }

  /**
   * Get selected commit
   */
  getSelectedCommit(): PrCommit | undefined {
    if (this.nav.activeSection !== 'commits' || this.nav.cursorIndex < 0) return undefined
    return this.visibleCommits[this.nav.cursorIndex]
  }

  /**
   * Get selected file
   */
  getSelectedFile(): DiffFile | undefined {
    if (this.nav.activeSection !== 'files' || this.nav.cursorIndex < 0) return undefined
    return this.visibleFiles[this.nav.cursorIndex]
  }

  /**
   * Get selected check
   */
  getSelectedCheck(): PrCheck | undefined {
    if (this.nav.activeSection !== 'checks' || this.nav.cursorIndex < 0) return undefined
    return this.flatCheckItems[this.nav.cursorIndex]?.check
  }

  /**
   * When the cursor is on an annotation row, return that annotation and
   * its parent check. `null` when the cursor is elsewhere (including on
   * a check row itself) (spec 043).
   */
  getSelectedAnnotation(): { check: PrCheck; annotation: PrCheckAnnotation } | null {
    if (this.nav.activeSection !== 'checks' || this.nav.cursorIndex < 0) return null
    const item = this.flatCheckItems[this.nav.cursorIndex]
    if (!item || item.kind !== 'annotation') return null
    return { check: item.check, annotation: item.annotation }
  }

  /**
   * Toggle expansion of a failing check. Asks for its annotations on first
   * expand (spec 043).
   */
  toggleCheckExpansion(checkId: number): void {
    const opening = !this.nav.expandedCheckIds.has(checkId)
    this.nav = Nav.toggleCheck(this.nav, checkId)
    if (opening) {
      const check = this.prInfo.checks?.find(c => c.id === checkId)
      if (check && !check.annotationsStatus && isFailingCheck(check)) {
        this.onOpenFailingCheck?.(check)
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
    if (this.nav.expandedCheckIds.has(check.id)) return
    this.toggleCheckExpansion(check.id)
  }

  /**
   * Collapse the currently-selected check row. If the cursor is on one
   * of that check's annotation rows, collapse its parent check and move
   * the cursor back onto the check row (spec 043).
   */
  collapseSelectedCheck(): void {
    if (this.nav.activeSection !== 'checks' || this.nav.cursorIndex < 0) return
    const item = this.flatCheckItems[this.nav.cursorIndex]
    if (!item) return
    const check = item.check
    if (!this.nav.expandedCheckIds.has(check.id)) return

    const parentIndex = this.flatCheckItems.findIndex(
      i => i.kind === 'check' && i.check.id === check.id,
    )
    this.toggleCheckExpansion(check.id)
    if (parentIndex >= 0 && this.nav.cursorIndex !== parentIndex) {
      this.nav = { ...this.nav, cursorIndex: parentIndex }
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
    if (this.nav.activeSection !== 'checks' || this.nav.cursorIndex < 0) return undefined
    const item = this.flatCheckItems[this.nav.cursorIndex]
    if (!item || item.kind !== 'check') return undefined
    return item.check
  }

  /** Where a failing check opened for the first time asks for its annotations. */
  setOnOpenFailingCheck(cb: ((check: PrCheck) => void) | null): void {
    this.onOpenFailingCheck = cb
  }

  /** A check's annotations moved on — loading, loaded or failed — and its rows follow. */
  checksChanged(): void {
    this.refreshFlatCheckItems()
    if (this.nav.activeSection === 'checks') this.nav = Nav.clampCursor(this.nav, this.counts)
    this.rebuildSections()
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
    
    this.nav = Nav.toggleContent(this.nav, flatConversationItemId(flatItem))
    this.refreshFlatItems()
    this.rebuildSections()
  }

  /**
   * Expand the currently selected conversation item (no-op if already expanded)
   */
  expandSelectedThread(): void {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return
    this.applyContent(Nav.expandContent(this.nav, flatConversationItemId(flatItem)))
  }

  /**
   * Collapse the currently selected conversation item (no-op if already collapsed)
   */
  collapseSelectedThread(): void {
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return
    this.applyContent(Nav.collapseContent(this.nav, flatConversationItemId(flatItem)))
  }

  private applyContent(next: PrInfoNav): void {
    if (next === this.nav) return
    this.nav = next
    this.refreshFlatItems()
    this.rebuildSections()
  }
  
  /**
   * Get the currently selected flat conversation item
   */
  getSelectedFlatItem(): FlatConversationItem | undefined {
    if (this.nav.activeSection !== 'conversation' || this.nav.cursorIndex < 0) return undefined
    return this.flatConversationItems[this.nav.cursorIndex]
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
    if (prInfo.body !== this.prInfo.body && this.nav.activeSection === 'description') this.clampDescriptionOnResize = true
    this.prInfo = prInfo
    this.conversationItems = conversationItems(this.prInfo, this.comments, this.hiddenConversationIds)
    this.refreshFlatItems()
    this.refreshFlatCheckItems()
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.pushMeta()
    this.rebuildSections()
  }

  private pushMeta(): void {
    this.meta?.update({ meta: panelMeta(this.prInfo), stack: stackLine(this.stack) })
  }

  /** What this PR is stacked on, and how that base has moved (spec 072). */
  setStack(stack: StackInfo | null): void {
    this.stack = stack
    this.pushMeta()
  }

  /** The links riff was given for this PR, and where they came from. */
  setPreviews(previews: PreviewSet | null): void {
    if (previews === this.previews) return
    this.previews = previews
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.rebuildSections()
  }

  /** The row the cursor is on, when it is on one (spec 068). */
  getSelectedPreview(): PreviewRow | undefined {
    if (this.nav.activeSection !== 'previews' || this.nav.cursorIndex < 0) return undefined
    return this.visiblePreviews[this.nav.cursorIndex]
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
    this.descriptionBox = null

    // Rebuild
    this.buildSections(this.sectionsContainer)
  }

  /** Every row `s` can jump to (spec 066). Ids are the panel's own. */
  flashTargets(): string[] {
    return Nav.flashTargets(this.nav, this.counts)
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
    switch (this.nav.activeSection) {
      case 'description':
        return { title: "Description", text: this.prInfo.body ?? "" }
      case 'conversation': {
        const item = this.flatConversationItems[this.nav.cursorIndex]
        if (!item) return { title: "Conversation", text: this.conversationText() }
        if (item.type === 'pending-reviewer') return null
        return { title: `@${item.data.author}`, text: item.data.body ?? "" }
      }
      case 'commits': {
        const commit = this.visibleCommits[this.nav.cursorIndex]
        return commit ? { title: commit.sha.slice(0, 7), text: commit.message } : null
      }
      case 'checks': {
        const item = this.flatCheckItems[this.nav.cursorIndex]
        if (!item) return null
        const url = item.kind === 'annotation' ? item.annotation.message : item.check.detailsUrl
        return url ? { title: item.check.name, text: url } : null
      }
      case 'previews': {
        const row = this.visiblePreviews[this.nav.cursorIndex]
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
    const target = Nav.flashJumpNav(this.nav, id, this.counts)
    if (!target) return

    this.setActiveSection(target.activeSection)
    this.nav = target
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
   * Check if a section has selectable items
   */
  private sectionHasItems(section: PRInfoPanelSection): boolean {
    return section !== 'description'
  }

  /**
   * Build the sections content
   */
  private buildSections(container: BoxRenderable): void {
    const configs = sectionConfigs({
      prInfo: this.prInfo,
      files: this.files,
      previews: this.previews,
      conversationItems: this.conversationItems,
      hiddenConversationIds: this.hiddenConversationIds,
      filter: this.nav.filter,
    })
    
    for (const config of configs) {
      const isActive = config.id === this.nav.activeSection
      const isExpanded = this.nav.expandedSections.has(config.id)
      const hasItems = this.sectionHasItems(config.id)
      
      // Header is highlighted when:
      // - Section is active AND cursor is on header (index -1)
      const headerHighlighted = isActive && this.nav.cursorIndex === -1
      
      const sectionBox = new BoxRenderable(this.renderer, {
        id: `section-${config.id}`,
        flexDirection: "column",
        width: "100%",
        marginTop: 1,
      })
      this.sectionBoxes.push(sectionBox)
      
      const header = sectionHeaderRow(config, {
        active: isActive,
        expanded: isExpanded,
        highlighted: headerHighlighted,
        label: this.flashLabels.get(config.id) ?? null,
      })
      sectionBox.add(this.headerIsland(config.id, header).host)
      
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
    if (section === 'description') {
      this.descriptionBox = this.descriptionIsland(isActive).host
      container.add(this.descriptionBox)
      return
    }

    const contentBox = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      width: "100%",
      paddingLeft: 2,
      marginTop: 1,
    })
    
    switch (section) {
      case 'previews':
      case 'checks':
      case 'files':
      case 'commits':
        contentBox.add(this.listIsland(section, isActive).host)
        break
      case 'conversation':
        contentBox.add(this.conversationIsland(isActive).host)
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

  /** The section's header island, made on first use, holding the header as it is now. */
  private headerIsland(section: PRInfoPanelSection, row: SectionHeaderRow): PrInfoHeaderIsland {
    let island = this.headerIslands.get(section)
    if (!island) {
      island = createPrInfoHeaderIsland(this.renderer, section)
      this.headerIslands.set(section, island)
    }
    island.update(row)
    return island
  }

  /** The conversation's island, made on first use, holding the rows as they are now. */
  private conversationIsland(isActive: boolean): PrInfoConversationIsland {
    this.conversation ??= createPrInfoConversationIsland(this.renderer, {
      id: "pr-info-conversation",
      markdown: {
        renderNode: tableRenderer(this.renderer, () => this.markdownWidth()),
        syntaxStyle: getSyntaxStyle(this.renderer.nativeScene),
      },
    })
    this.conversation.update(this.conversationRows(isActive))
    return this.conversation
  }

  /** The description's island, made on first use, holding the description as it is now. */
  private descriptionIsland(isActive: boolean): PrInfoDescriptionIsland {
    this.description ??= createPrInfoDescriptionIsland(this.renderer, {
      id: "pr-info-description",
      markdown: {
        renderNode: tableRenderer(this.renderer, () => this.markdownWidth()),
        syntaxStyle: getSyntaxStyle(this.renderer.nativeScene),
      },
      onResize: () => this.descriptionResized(),
    })
    this.description.update(this.descriptionModel(isActive))
    return this.description
  }

  private descriptionResized(): void {
    if (!this.clampDescriptionOnResize) return
    this.clampDescriptionOnResize = false
    if (this.nav.activeSection !== 'description' || this.nav.cursorIndex <= this.getMaxCursorIndex()) return
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.pushRows('description')
  }

  /** A cursor move inside a section on an island restyles its rows without a rebuild. */
  private pushRows(section: PRInfoPanelSection): void {
    const isActive = section === this.nav.activeSection
    if (section === 'description') this.description?.update(this.descriptionModel(isActive))
    else if (section === 'conversation') this.conversation?.update(this.conversationRows(isActive))
    else if (isListSection(section)) this.listIslands.get(section)?.update(this.listRows(section, isActive))
  }

  private descriptionModel(isActive: boolean): DescriptionModel {
    return descriptionModel(this.prInfo, { cursor: this.nav.cursorIndex, active: isActive })
  }

  private conversationRows(isActive: boolean): ConversationRows {
    this.refreshFlatItems()
    return conversationRows(this.flatConversationItems, {
      selected: isActive ? this.nav.cursorIndex : -1,
      labels: this.flashLabels,
      expanded: this.nav.expandedContent,
      terminalWidth: getTerminalWidth(),
      diffContext: (filename, line) => fileDiffContext(this.files, filename, line),
    })
  }

  private listRows(section: ListSection, isActive: boolean): ListRows {
    const input = { selected: isActive ? this.nav.cursorIndex : -1, labels: this.flashLabels }
    switch (section) {
      case 'previews':
        return previewRows(this.visiblePreviews, input)
      case 'checks':
        return checkRows(this.flatCheckItems, {
          ...input,
          expanded: this.nav.expandedCheckIds,
          hasChecks: (this.prInfo.checks ?? []).length > 0,
        })
      case 'files':
        return fileRows(this.visibleFiles, { ...input, listWidth: getListItemWidth() })
      case 'commits':
        return commitRows(this.visibleCommits, { ...input, terminalWidth: getTerminalWidth() })
    }
  }

  /**
   * Build the panel
   */
  private build(): { container: BoxRenderable; scrollBox: ScrollBoxRenderable } {
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
      // scroll made here only reaches the next frame, but setting scrollTop
      // moves the content, which asks the renderer for that frame itself.
      renderBefore: () => {
        if (this.pendingScrollTop !== null) {
          this.scrollBox.scrollTop = this.pendingScrollTop
          this.pendingScrollTop = null
          return
        }
        if (!this.revealPending) return
        this.revealPending = false
        this.revealCursor()
      },
    })
    container.add(scrollBox)

    // Content container inside scroll box
    const content = new BoxRenderable(this.renderer, {
      flexDirection: "column",
      width: "100%",
    })
    scrollBox.add(content)

    // What the header line does not already say (spec 067), and what this
    // PR is stacked on. Repeating the title, status and counts spent five
    // rows saying nothing and pushed the sections off the first screen.
    this.meta = createPrInfoMetaIsland(this.renderer)
    this.pushMeta()
    content.add(this.meta.host)

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

    container.add(this.commentPrompt.host)

    return { container, scrollBox }
  }

  /** Opens, restyles or closes the `gC` prompt; render.ts pushes it from state on every render. */
  updateCommentInput(open: boolean, text: string, loading: boolean, error: string | null): void {
    this.commentPrompt.update(prCommentPromptModel({ open, text, loading, error }))
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    for (const island of this.listIslands.values()) island.dispose()
    this.listIslands.clear()
    this.conversation?.dispose()
    this.conversation = null
    this.description?.dispose()
    this.description = null
    for (const island of this.headerIslands.values()) island.dispose()
    this.headerIslands.clear()
    this.meta?.dispose()
    this.meta = null
    this.commentPrompt.dispose()
    this.container.parent?.remove(this.container)
    this.container.destroyRecursively()
  }
}
