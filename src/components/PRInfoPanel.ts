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
import {
  ALL_SECTIONS,
  conversationItems,
  flatCheckItems,
  flatConversationItemId,
  flatConversationItems,
  isFailingCheck,
  visibleRows,
  type ConversationItem,
  type FlatCheckItem,
  type FlatConversationItem,
} from "./pr-info-items"
import { panelMeta, stackLine } from "./pr-info-header"
import { commitRowCount } from "./pr-info-list-rows"
import { panelSections } from "./pr-info-panel-model"
import { getSyntaxStyle } from "./pr-info-syntax-style"
import { createPrInfoPanelIsland, type PrInfoPanelIsland } from "../app/pr-info-panel"
import { prCommentPromptModel } from "./pr-comment-prompt"
import * as Nav from "./pr-info-nav"
import type { PrInfoNav } from "./pr-info-nav"

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
  private island: PrInfoPanelIsland
  private prInfo: PrInfo
  private files: DiffFile[]
  private comments: Comment[]
  
  private nav: PrInfoNav = Nav.initialNav()
  private readonly counts: Nav.SectionCounts = (section) => this.getItemCountForSection(section)

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

  // Commits the base has that the head lacks (spec 108); null until known.
  private behindBy: number | null = null
  
  // Flattened items cache (includes expanded review threads as separate items)
  private flatConversationItems: FlatConversationItem[] = []

  private flatCheckItems: FlatCheckItem[] = []
  // Where a failing check asks for its annotations; the app fetches them (set by app.ts).
  private onOpenFailingCheck: ((check: PrCheck) => void) | null = null
  
  // Set when the cursor moved; the next frame scrolls it into view, once
  // layout has placed whatever the move changed.
  private revealPending = false
  // Where a restored position had scrolled to. A panel restored before its
  // first layout would clamp it to 0, so the first frame applies it.
  private pendingScrollTop: number | null = null
  
  // A new body is only measured by the next layout, so the cursor that was
  // in the old one is taken back onto the new one's last line from there.
  private clampDescriptionOnResize = false

  // Flash labels by row id, while `s` is labelling (spec 066).
  private flashLabels: ReadonlyMap<string, string> = new Map()

  constructor(renderer: CliRenderer, prInfo: PrInfo, files: DiffFile[] = [], comments: Comment[] = []) {
    this.renderer = renderer
    this.prInfo = prInfo
    this.files = files
    this.comments = comments
    
    // Build conversation items
    this.conversationItems = conversationItems(this.prInfo, this.comments, this.hiddenConversationIds)
    this.refreshFlatItems()
    this.refreshFlatCheckItems()

    this.island = createPrInfoPanelIsland(renderer, {
      markdown: {
        renderNode: tableRenderer(renderer, () => this.markdownWidth()),
        syntaxStyle: getSyntaxStyle(renderer.nativeScene),
      },
      onFilterInput: (value) => this.onFilterChange?.(value),
      beforeScrollRender: () => this.beforeScrollRender(),
      onDescriptionResize: () => this.descriptionResized(),
    })
    this.pushMeta()
    this.push()
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
   * description. The panel is the whole of the row it is mounted in, so the
   * terminal's width is the width it is about to have, and it is what the
   * inline overlay's tables already measure against.
   */
  private markdownWidth(): number {
    return this.island.host.width || this.renderer.width
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

  /** `gg`: the description's header, with the lines above it in view. */
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
    this.revealPending = true
    this.renderer.requestRender()
  }

  /** Where the cursor row is on screen, and how tall. */
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
    return row ? { y: row.y, height: Math.max(1, row.height) } : null
  }

  /** The description's box while its section is open; a folded one is hidden and counts no rows. */
  private openDescription(): BoxRenderable | null {
    return this.nav.expandedSections.has('description') ? this.island.descriptionBox() : null
  }

  /**
   * Scroll just enough to keep the cursor row `CURSOR_SCROLL_OFF` rows off
   * the edges. Runs from the scroll box's own render, after layout, so a
   * row the move just changed is measured where it now is.
   */
  private revealCursor(): void {
    const bounds = this.cursorBounds()
    if (!bounds) return

    const viewport = this.island.scrollBox.viewport
    const off = Math.min(CURSOR_SCROLL_OFF, Math.floor((viewport.height - 1) / 2))
    const top = bounds.y - viewport.y
    // A row taller than the room between the margins shows its top.
    const bottom = top + Math.min(bounds.height, viewport.height - 2 * off)

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
      input.value = filter
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

  /**
   * Toggle expand/collapse for the active section (za)
   */
  toggleSection(): void {
    this.nav = Nav.toggleSection(this.nav)
    this.push()
  }

  /**
   * Collapse the active section (zm)
   */
  collapseSection(): void {
    this.nav = Nav.collapseSection(this.nav)
    this.push()
  }

  /**
   * Expand the active section (zr)
   */
  expandSection(): void {
    this.nav = Nav.expandSection(this.nav)
    this.push()
  }

  /**
   * Collapse all sections (zM)
   */
  collapseAllSections(): void {
    this.nav = Nav.collapseAll(this.nav)
    this.push()
  }

  /**
   * Expand all sections (zR)
   */
  expandAllSections(): void {
    this.nav = Nav.expandAll(this.nav)
    this.push()
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
    this.push()
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
      this.nav = Nav.withCursor(this.nav, parentIndex)
      this.push()
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
    const flatItem = this.getSelectedFlatItem()
    if (!flatItem) return
    
    this.nav = Nav.toggleContent(this.nav, flatConversationItemId(flatItem))
    this.refreshFlatItems()
    this.push()
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
  setBehindBy(behindBy: number | null): void {
    if (behindBy === this.behindBy) return
    this.behindBy = behindBy
    this.push()
  }

  /** The links riff was given for this PR, and where they came from. */
  setPreviews(previews: PreviewSet | null): void {
    if (previews === this.previews) return
    this.previews = previews
    this.nav = Nav.clampCursor(this.nav, this.counts)
    this.push()
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
        nav: this.nav,
        flashLabels: this.flashLabels,
        terminalWidth: getTerminalWidth(),
        listWidth: getListItemWidth(),
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
   * The first point a frame has the rows a push changed laid out. A scroll
   * made here only reaches the next frame, but setting scrollTop moves the
   * content, which asks the renderer for that frame itself.
   */
  private beforeScrollRender(): void {
    if (this.pendingScrollTop !== null) {
      this.island.scrollBox.scrollTop = this.pendingScrollTop
      this.pendingScrollTop = null
      return
    }
    if (!this.revealPending) return
    this.revealPending = false
    this.revealCursor()
  }

  /** Opens, restyles or closes the `gC` prompt; its frame follower pushes it from state on every frame. */
  updateCommentInput(open: boolean, text: string, loading: boolean, error: string | null): void {
    this.island.update({ prompt: prCommentPromptModel({ open, text, loading, error }) })
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    this.island.dispose()
  }
}
