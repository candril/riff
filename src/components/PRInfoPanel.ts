/**
 * PR Info Panel v2 - Section-based navigation
 * Shows PR metadata with collapsible sections navigated via Tab/j/k
 */

import type { BoxRenderable, CliRenderer, ScrollBoxRenderable } from "@opentui/core"
import type { PrInfo, PrCommit, PrCheck, PrCheckAnnotation } from "../providers/github/types"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow, PreviewSet } from "../utils/previews"
import type { LinkSource } from "../utils/link-targets"
import type { StackInfo } from "../utils/stack"
import type { Comment, ReactionTarget } from "../types"
import type { PRInfoPanelSection } from "../state"
import { tableRenderer } from "./markdown-tables-in-markdown"
import { mergeStatus, type BehindBy, type MergePoint, type MergeStatus } from "./merge-status-model"
import {
  ALL_SECTIONS,
  conversationItems,
  flatCheckItems,
  flatConversationItemId,
  flatConversationItems,
  isExpandablePoint,
  isFailingCheck,
  visibleRows,
  type ConversationItem,
  type FlatCheckItem,
  type FlatConversationItem,
  type MergeRows,
} from "./pr-info-items"
import { panelMeta, stackLine } from "./pr-info-header"
import { commitRowCount } from "./pr-info-list-rows"
import { panelSections } from "./pr-info-panel-model"
import { checkNodes, conversationNodes, leafNodes, type RowNode } from "./pr-info-tree"
import { getSyntaxStyle } from "./pr-info-syntax-style"
import { createPrInfoPanelIsland, type PrInfoPanelIsland } from "../app/pr-info-panel"
import { prCommentPromptModel } from "./pr-comment-prompt"
import * as Nav from "./pr-info-nav"
import type { PrInfoNav } from "./pr-info-nav"

/** What the file and commit lists leave their names, out of the panel's width. */
function listItemWidth(panelWidth: number): number {
  // Reserve space for: indent (4) + icon (2) + status (~15) + padding (~6)
  const reserved = 27
  return Math.max(30, panelWidth - reserved)
}

function sameSections(a: ReadonlySet<PRInfoPanelSection>, b: ReadonlySet<PRInfoPanelSection>): boolean {
  if (a.size !== b.size) return false
  for (const section of a) if (!b.has(section)) return false
  return true
}

/** Rows kept between the cursor and the edge it is moving towards. */
const CURSOR_SCROLL_OFF = 3

const LINK_ALIGN_FRAMES = 4

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
  expandedPoints: Set<MergePoint["id"]>
  filterOpened: Set<PRInfoPanelSection>
  filterFolded: Set<string>
  scrollTop: number
}

/**
 * PR Info Panel - class-based for efficient updates
 */
export class PRInfoPanelClass {
  private renderer: CliRenderer
  private island: PrInfoPanelIsland
  private prInfo: PrInfo
  private files: DiffFile[]
  private comments: Comment[]
  
  private nav: PrInfoNav
  private readonly counts: Nav.SectionCounts = (section) => this.getItemCountForSection(section)

  private filterFocused: boolean = false
  private seedingFilter = false
  private onFilterChange: ((value: string) => void) | null = null
  // Where the sections the reader opens or folds are kept for the review (set by app.ts).
  private onSectionsChange: ((open: ReadonlySet<PRInfoPanelSection>) => void) | null = null

  // Conversation items (computed from prInfo + comments)
  private conversationItems: ConversationItem[] = []

  // Comments another section now speaks for — the deploy bot's preview
  // table, say (specs 067, 068). Folded away here, never dropped.
  private hiddenConversationIds: ReadonlySet<string> = new Set()

  // Preview links lifted out of a deploy bot's table (spec 068).
  private previews: PreviewSet | null = null

  // What this PR is stacked on (spec 072); undefined until it is known.
  private stack: StackInfo | null | undefined = undefined

  // Commits the base has that the head lacks (spec 108); see BehindBy.
  private behindBy: BehindBy = null

  // Whether the PR can merge, gate by gate (spec 108), from prInfo, the
  // comments and behindBy; recomputed whenever one of them changes.
  private mergeStatus: MergeStatus
  
  // Flattened items cache (includes expanded review threads as separate items)
  private flatConversationItems: FlatConversationItem[] = []

  private flatCheckItems: FlatCheckItem[] = []
  // Where a failing check asks for its annotations; the app fetches them (set by app.ts).
  private onOpenFailingCheck: ((check: PrCheck) => void) | null = null
  
  // Set when the cursor moved; the next frame scrolls it into view, before
  // its layout and again once layout has placed whatever the move changed.
  private revealPending = false
  // Frames left in which a row a link landed on is kept at the top. An
  // opened comment's body is measured a frame or two after it is pushed,
  // and a reveal made before that leaves the row at the bottom edge with
  // its body off screen.
  private alignTopFrames = 0
  // Where a restored position had scrolled to. A panel restored before its
  // first layout would clamp it to 0, so the first frame applies it.
  private pendingScrollTop: number | null = null
  
  // A new body is only measured by the next layout, so the cursor that was
  // in the old one is taken back onto the new one's last line from there.
  private clampDescriptionOnResize = false

  // Flash labels by row id, while `s` is labelling (spec 066).
  private flashLabels: ReadonlyMap<string, string> = new Map()

  // Headers and list rows are cut to the panel's width when they are
  // pushed, and that width follows the screen's, so a resize has to push
  // them again or they keep the old cut.
  private readonly onResize = () => this.push()

  // The width the panel is drawn at, which only the app knows: the rows are
  // cut to it before layout gives the panel a width of its own, and a row
  // too wide for it squeezes the segments in front of the one to cut.
  private readonly width: () => number

  constructor(
    renderer: CliRenderer,
    prInfo: PrInfo,
    files: DiffFile[] = [],
    comments: Comment[] = [],
    openSections?: ReadonlySet<PRInfoPanelSection>,
    width: () => number = () => renderer.width,
  ) {
    this.renderer = renderer
    this.width = width
    this.nav = Nav.initialNav(openSections)
    this.prInfo = prInfo
    this.files = files
    this.comments = comments
    
    // Build conversation items
    this.conversationItems = conversationItems(this.prInfo, this.comments, this.hiddenConversationIds)
    this.mergeStatus = this.readMergeStatus()
    this.refreshFlatItems()
    this.refreshFlatCheckItems()

    this.island = createPrInfoPanelIsland(renderer, {
      markdown: {
        renderNode: tableRenderer(renderer, () => this.markdownWidth()),
        syntaxStyle: getSyntaxStyle(renderer.nativeScene),
      },
      // The seed is the filter coming back, not the reader typing, and
      // reporting it would render from inside the frame pass.
      onFilterInput: (value) => {
        if (!this.seedingFilter) this.onFilterChange?.(value)
      },
      beforeScrollRender: () => this.beforeScrollRender(),
      onDescriptionResize: () => this.descriptionResized(),
    })
    this.pushMeta()
    this.push()
    renderer.on("resize", this.onResize)
    renderer.setFrameCallback(this.beforeLayout)
  }

  /**
   * Get the container element
   */
  getContainer(): BoxRenderable {
    return this.island.host
  }

  /**
   * How wide a markdown table in this panel may be.
   *
   * The panel's own width, once it has one. It has none before its first
   * layout, when the first push already renders a table in the PR's
   * description, so until then it is the width the app says the panel is
   * about to be drawn at.
   */
  private markdownWidth(): number {
    return this.island.host.width || this.width()
  }

  /**
   * Get the scroll box for external scrolling
   */
  getScrollBox(): ScrollBoxRenderable {
    return this.island.scrollBox
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
      expandedPoints: new Set(this.nav.expandedPoints),
      filterOpened: new Set(this.nav.filterOpened),
      filterFolded: new Set(this.nav.filterFolded),
      // A panel rebuilt again before its first frame has not applied its
      // restored scroll yet; the box still reads 0.
      scrollTop: this.pendingScrollTop ?? this.island.scrollBox.scrollTop,
    }
  }

  restorePosition(position: PRInfoPanelPosition): void {
    const restored = Nav.navAt(position, this.nav.filter)
    // The section can have fewer items than it had — a review that was
    // resolved away, a check that finished and folded its annotations.
    this.refreshFlatItems(restored)
    this.refreshFlatCheckItems(restored)
    this.nav = Nav.restoreNav(restored, (section) => this.getItemCountForSection(section, restored))

    this.push()
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
    this.flatConversationItems = flatConversationItems(this.conversationItems, nav.filter, nav.expandedContent, nav.filterFolded)
  }

  private refreshFlatCheckItems(nav: PrInfoNav = this.nav): void {
    this.flatCheckItems = flatCheckItems(this.mergeStatus.points, this.mergeRows(), nav)
  }

  private mergeRows(): MergeRows {
    return { checks: this.prInfo.checks, threads: this.mergeStatus.threads }
  }

  private readMergeStatus(): MergeStatus {
    return mergeStatus({ prInfo: this.prInfo, comments: this.comments, behindBy: this.behindBy })
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
    this.nav = next
    this.push()
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
    const half = Math.max(1, Math.floor(this.island.scrollBox.viewport.height / 2))
    this.island.scrollBox.scrollBy(delta * half)
    for (let i = 0; i < half && this.step(delta); i++) {}
  }

  /** `gg`: the first section's header, with the lines above it in view. */
  jumpToTop(): void {
    this.flashJump(ALL_SECTIONS[0]!)
    this.island.scrollBox.scrollTo(0)
  }

  /** `G`: the last row of the last section, or its header if it is folded. */
  jumpToBottom(): void {
    this.flashJump(Nav.bottomTarget(this.nav, this.counts))
  }

  private followCursor(): void {
    this.pendingScrollTop = null
    this.alignTopFrames = 0
    this.revealPending = true
    this.renderer.requestRender()
  }

  /** Where the cursor row is on screen, and how tall: no height before its first layout. */
  private cursorBounds(): { y: number; height: number } | null {
    const section = this.nav.activeSection
    if (this.nav.cursorIndex === -1) {
      const header = this.island.headerOf(section)
      return header ? { y: header.y, height: 1 } : null
    }
    if (section === 'description') {
      const box = this.openDescription()
      if (!box || box.height === 0) return null
      return { y: box.y + Math.min(this.nav.cursorIndex, box.height - 1), height: 1 }
    }
    const row = this.island.rowAt(section, this.nav.cursorIndex)
    return row ? { y: row.y, height: row.height } : null
  }

  /** The description's box while its section is open; a folded one is hidden and counts no rows. */
  private openDescription(): BoxRenderable | null {
    return this.nav.expandedSections.has('description') ? this.island.descriptionBox() : null
  }

  /**
   * Scroll just enough to keep the cursor row `CURSOR_SCROLL_OFF` rows off
   * the edges, measured where the last layout put it. Before a frame's
   * layout a row that has never been laid out is left for after it.
   */
  private revealCursor(beforeLayout = false): void {
    const bounds = this.cursorBounds()
    if (!bounds || (beforeLayout && bounds.height === 0)) return

    const viewport = this.island.scrollBox.viewport
    const off = Math.min(CURSOR_SCROLL_OFF, Math.floor((viewport.height - 1) / 2))
    const top = bounds.y - viewport.y
    if (this.alignTopFrames > 0) {
      if (top !== off) this.island.scrollBox.scrollBy(top - off)
      return
    }
    // A row taller than the room between the margins shows its top.
    const bottom = top + Math.min(Math.max(1, bounds.height), viewport.height - 2 * off)

    if (top < off) {
      this.island.scrollBox.scrollBy(top - off)
    } else if (bottom > viewport.height - off) {
      this.island.scrollBox.scrollBy(bottom - (viewport.height - off))
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

  private visible(nav: PrInfoNav = this.nav) {
    return visibleRows({ prInfo: this.prInfo, files: this.files, previews: this.previews }, nav.filter)
  }

  /** Narrow the panel to rows containing this text, or clear it with "". */
  setFilter(filter: string): void {
    if (filter === this.nav.filter) return
    const filtered = Nav.withFilter(this.nav, filter)
    this.refreshFlatItems(filtered)
    this.refreshFlatCheckItems(filtered)
    this.nav = Nav.setFilter(this.nav, filter, (section) => this.getItemCountForSection(section, filtered))
    this.push()
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
    this.island.update({ filterOpen: open })

    const input = this.island.filterInput
    if (open) {
      this.seedingFilter = true
      try {
        input.value = filter
      } finally {
        this.seedingFilter = false
      }
      input.focus()
    } else {
      input.blur()
    }
  }

  /**
   * Get item count for a specific section
   */
  private getItemCountForSection(section: PRInfoPanelSection, nav: PrInfoNav = this.nav): number {
    switch (section) {
      case 'description':
        // Read like a buffer: its items are the rows it renders to.
        return this.openDescription()?.height ?? 0
      case 'checks':
        return this.flatCheckItems.length
      case 'conversation':
        return this.flatConversationItems.length
      case 'files':
        return this.visible(nav).files.length
      case 'commits':
        return commitRowCount(this.visible(nav).commits)
      case 'previews':
        return this.visible(nav).previews.length
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
    this.push()
    this.followCursor()
  }

  /** Folding the section the cursor is in takes the cursor up onto its header, the one row left. */
  collapseSection(): void {
    const onRow = this.nav.cursorIndex !== -1
    this.applyFolds(Nav.withCursor(Nav.collapseSection(this.nav), -1))
    if (onRow) this.followCursor()
  }

  expandSection(): void {
    this.applyFolds(Nav.expandSection(this.nav))
  }

  /**
   * `zM`/`zm`: the folds inside a section are left as they are, to show
   * again when it reopens. The cursor goes up onto its header, as with `zc`.
   */
  collapseAllSections(): void {
    const onRow = this.nav.cursorIndex !== -1
    this.applyFolds(Nav.withCursor(Nav.collapseAll(this.nav), -1))
    if (onRow) this.followCursor()
  }

  /**
   * `zR`/`zr`. Checks and threads stay folded: opening every failing check
   * would also fetch the annotations of each.
   */
  expandAllSections(): void {
    this.applyFolds(Nav.expandAll(this.nav))
  }

  /**
   * Only the reader's own folds are reported. A filter opens sections too,
   * but that is a narrowing for the moment, not a choice to keep them open.
   */
  private applyFolds(next: PrInfoNav): void {
    const before = Nav.readerSections(this.nav)
    const after = Nav.readerSections(next)
    this.nav = next
    this.push()
    if (!sameSections(before, after)) this.onSectionsChange?.(after)
  }

  /** Where the sections the reader opens and folds are reported. Set once, from app.ts. */
  setOnSectionsChange(callback: (open: ReadonlySet<PRInfoPanelSection>) => void): void {
    this.onSectionsChange = callback
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
    return this.visible().commits[this.nav.cursorIndex]
  }

  /**
   * Get selected file
   */
  getSelectedFile(): DiffFile | undefined {
    if (this.nav.activeSection !== 'files' || this.nav.cursorIndex < 0) return undefined
    return this.visible().files[this.nav.cursorIndex]
  }

  /**
   * Get selected check
   */
  getSelectedCheck(): PrCheck | undefined {
    const item = this.selectedCheckItem()
    return item && item.kind !== 'point' && item.kind !== 'thread' ? item.check : undefined
  }

  /** The unresolved thread under the cursor, in the merge status's conversations line (spec 108). */
  getSelectedMergeThread(): Comment | undefined {
    const item = this.selectedCheckItem()
    return item?.kind === 'thread' ? item.thread : undefined
  }

  private selectedCheckItem(): FlatCheckItem | undefined {
    if (this.nav.activeSection !== 'checks' || this.nav.cursorIndex < 0) return undefined
    return this.flatCheckItems[this.nav.cursorIndex]
  }

  /** The merge status line under the cursor, when it opens onto rows of its own. */
  private selectedExpandablePoint(): MergePoint | undefined {
    const item = this.selectedCheckItem()
    return item?.kind === 'point' && isExpandablePoint(item.point, this.mergeRows()) ? item.point : undefined
  }

  /**
   * Open or fold the merge status line under the cursor. False when the
   * cursor is on no line that opens, so the key can mean what it means on a
   * check (spec 108).
   */
  toggleSelectedPoint(): boolean {
    const point = this.selectedExpandablePoint()
    if (!point) return false
    this.applyPoints(Nav.togglePoint(this.nav, point.id))
    return true
  }

  private applyPoints(next: PrInfoNav): void {
    if (next === this.nav) return
    this.nav = next
    this.refreshFlatCheckItems()
    this.push()
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
    this.push()
  }

  /** Where a failing check opened for the first time asks for its annotations. */
  setOnOpenFailingCheck(cb: ((check: PrCheck) => void) | null): void {
    this.onOpenFailingCheck = cb
  }

  /** A check's annotations moved on — loading, loaded or failed — and its rows follow. */
  checksChanged(): void {
    this.refreshFlatCheckItems()
    if (this.nav.activeSection === 'checks') this.nav = Nav.clampCursor(this.nav, this.counts)
    this.push()
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
    if (!this.getSelectedFlatItem()) return
    // Whether it is open is read from what is drawn: a filter shows a
    // review's threads without the reader opening it.
    const open = this.rowNodes()[this.nav.cursorIndex]?.open ?? false
    this.foldRow(this.nav.cursorIndex, !open)
  }

  /** The active section's rows as a tree, for the fold keys (spec 067). */
  rowNodes(): RowNode[] {
    switch (this.nav.activeSection) {
      case 'checks':
        return checkNodes(this.flatCheckItems, this.mergeRows(), this.nav.expandedCheckIds)
      case 'conversation':
        return conversationNodes(this.flatConversationItems, this.nav.expandedContent)
      default:
        return leafNodes(this.getItemCountForSection(this.nav.activeSection))
    }
  }

  openRow(index: number): void {
    this.foldRow(index, true)
  }

  /** The cursor lands on the row it folded, which may be the one it was on or the fold around it. */
  closeRow(index: number): void {
    this.foldRow(index, false)
    this.moveCursorTo(index)
  }

  moveCursorTo(index: number): boolean {
    return this.moveTo(Nav.withCursor(this.nav, index))
  }

  /** Open a section and stand on its first row, where `Enter` has something to act on (`gp`, spec 113). */
  focusSection(section: PRInfoPanelSection): void {
    this.setActiveSection(section)
    if (!this.isSectionExpanded()) this.expandSection()
    if (this.getItemCountForSection(section) > 0) this.moveCursorTo(0)
  }

  /**
   * Stand on the conversation row `matches` picks, opened, as a link to it
   * shows it (spec 115). A filter would hide the row, so it goes. False when
   * no row is it: a comment deleted since, or one another section speaks for.
   */
  revealConversationItem(matches: (item: FlatConversationItem) => boolean): boolean {
    this.setFilter("")
    this.setActiveSection('conversation')
    if (!this.isSectionExpanded()) this.expandSection()
    const index = this.flatConversationItems.findIndex(matches)
    if (index === -1) return false
    this.openRow(index)
    this.moveCursorTo(index)
    this.followCursor()
    this.alignTopFrames = LINK_ALIGN_FRAMES
    return true
  }

  private foldRow(index: number, open: boolean): void {
    if (this.nav.activeSection === 'conversation') {
      const item = this.flatConversationItems[index]
      if (!item) return
      const id = flatConversationItemId(item)
      return this.applyContent(open ? Nav.expandContent(this.nav, id) : Nav.collapseContent(this.nav, id))
    }
    if (this.nav.activeSection !== 'checks') return
    const item = this.flatCheckItems[index]
    if (item?.kind === 'point') {
      this.applyPoints(open ? Nav.expandPoint(this.nav, item.point.id) : Nav.collapsePoint(this.nav, item.point.id))
    } else if (item?.kind === 'check' && this.nav.expandedCheckIds.has(item.check.id) !== open) {
      // Through the toggle, so a failing check opened by any key asks for its annotations.
      this.toggleCheckExpansion(item.check.id)
    }
  }

  private applyContent(next: PrInfoNav): void {
    if (next === this.nav) return
    this.nav = next
    this.refreshFlatItems()
    this.push()
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
    this.mergeStatus = this.readMergeStatus()
    this.refreshFlatItems()
    this.refreshFlatCheckItems()
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.pushMeta()
    this.push()
  }

  private pushMeta(): void {
    this.island.update({ meta: { meta: panelMeta(this.prInfo), stack: stackLine(this.stack) } })
  }

  /** What this PR is stacked on, and how that base has moved (spec 072). */
  setStack(stack: StackInfo | null): void {
    this.stack = stack
    this.pushMeta()
  }

  /** How far the head is behind its base, once the compare has answered. */
  setBehindBy(behindBy: BehindBy): void {
    if (behindBy === this.behindBy) return
    this.behindBy = behindBy
    this.mergeStatus = this.readMergeStatus()
    this.refreshFlatCheckItems()
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.push()
  }

  /** The links riff was given for this PR, and where they came from. */
  setPreviews(previews: PreviewSet | null): void {
    if (previews === this.previews) return
    this.previews = previews
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.push()
  }

  getPreviews(): PreviewSet | null {
    return this.previews
  }

  /** The row the cursor is on, when it is on one (spec 068). */
  getSelectedPreview(): PreviewRow | undefined {
    if (this.nav.activeSection !== 'previews' || this.nav.cursorIndex < 0) return undefined
    return this.visible().previews[this.nav.cursorIndex]
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

    const visible = this.visible()
    for (const row of visible.previews) all.push(this.previewSource(row))
    for (const item of this.flatConversationItems) {
      if (item.type === 'pending-reviewer') continue
      all.push({ title: `@${item.data.author}`, text: item.data.body ?? "" })
    }
    // A green run is not a place anyone goes, and a monorepo has fifty of
    // them — a failing one is. The check under the cursor is `focused`.
    for (const check of this.prInfo.checks ?? []) {
      if (check.detailsUrl && isFailingCheck(check)) all.push({ title: check.name, text: check.detailsUrl })
    }
    for (const commit of visible.commits) {
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
        const commit = this.visible().commits[this.nav.cursorIndex]
        return commit ? { title: commit.sha.slice(0, 7), text: commit.message } : null
      }
      case 'checks': {
        const item = this.flatCheckItems[this.nav.cursorIndex]
        if (!item) return null
        if (item.kind === 'point') return { title: "Merge status", text: item.point.text }
        if (item.kind === 'thread') return { title: `@${item.thread.author ?? "you"}`, text: item.thread.body }
        const url = item.kind === 'annotation' ? item.annotation.message : item.check.detailsUrl
        return url ? { title: item.check.name, text: url } : null
      }
      case 'previews': {
        const row = this.visible().previews[this.nav.cursorIndex]
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
    this.push()
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
    this.push()
  }

  /** Show or hide the labels. */
  setFlashLabels(labels: ReadonlyMap<string, string>): void {
    this.flashLabels = labels
    this.push()
  }

  /** Hands the island the sections as they are now, from everything the panel holds. */
  private push(): void {
    this.refreshFlatItems()
    this.island.update({
      sections: panelSections({
        prInfo: this.prInfo,
        files: this.files,
        previews: this.previews,
        conversationItems: this.conversationItems,
        hiddenConversationIds: this.hiddenConversationIds,
        flatConversationItems: this.flatConversationItems,
        flatCheckItems: this.flatCheckItems,
        mergeStatus: this.mergeStatus,
        nav: this.nav,
        flashLabels: this.flashLabels,
        panelWidth: this.width(),
        listWidth: listItemWidth(this.width()),
      }),
    })
  }

  private descriptionResized(): void {
    if (!this.clampDescriptionOnResize) return
    this.clampDescriptionOnResize = false
    if (this.nav.activeSection !== 'description' || this.nav.cursorIndex <= this.getMaxCursorIndex()) return
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.push()
  }

  /**
   * Before the frame's layout, the last layout still places every row a
   * push did not change, which is all a plain cursor move touches. A scroll
   * made here is drawn in this very frame. One made from any hook after
   * layout, `renderBefore` or a size change alike, reaches only the next:
   * OpenTUI has placed the frame's rows for painting by then.
   */
  private readonly beforeLayout = async (): Promise<void> => {
    if (this.revealPending && this.pendingScrollTop === null) this.revealCursor(true)
  }

  /**
   * The first point a frame has the rows a push changed laid out, which
   * corrects a reveal made before it from where those rows used to be. A
   * scroll made here only reaches the next frame, but setting scrollTop
   * moves the content, which asks the renderer for that frame itself.
   */
  private beforeScrollRender(): void {
    if (this.pendingScrollTop !== null) {
      this.island.scrollBox.scrollTop = this.pendingScrollTop
      this.pendingScrollTop = null
      return
    }
    if (!this.revealPending) return
    this.revealCursor()
    if (this.alignTopFrames > 0 && --this.alignTopFrames > 0) {
      this.renderer.requestRender()
      return
    }
    this.revealPending = false
  }

  /** Opens, restyles or closes the `gC` prompt; its frame follower pushes it from state on every frame. */
  updateCommentInput(open: boolean, text: string, loading: boolean, error: string | null): void {
    this.island.update({ prompt: prCommentPromptModel({ open, text, loading, error }) })
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    this.renderer.off("resize", this.onResize)
    this.renderer.removeFrameCallback(this.beforeLayout)
    this.island.dispose()
  }
}
