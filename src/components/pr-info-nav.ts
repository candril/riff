import type { PRInfoPanelSection } from "../state"
import type { ReactionTarget } from "../types"
import type { MergePoint } from "./merge-status-model"
import { ALL_SECTIONS, isRowOpen, type FlatConversationItem } from "./pr-info-items"

/** Where the reader is in the PR info panel, and what they have opened. */
export interface PrInfoNav {
  readonly activeSection: PRInfoPanelSection
  /** -1 is the section's header. */
  readonly cursorIndex: number
  readonly expandedSections: ReadonlySet<PRInfoPanelSection>
  readonly expandedThreads: ReadonlySet<string>
  readonly expandedContent: ReadonlySet<string>
  // Per session only: never written to the session file (spec 043).
  readonly expandedCheckIds: ReadonlySet<number>
  // Per session only, like the checks: which merge status lines are open (spec 108).
  readonly expandedPoints: ReadonlySet<MergePoint["id"]>
  /** Sections a filter opened that the reader had not: open on screen, but not theirs to keep. */
  readonly filterOpened: ReadonlySet<PRInfoPanelSection>
  /**
   * Merge status lines and conversation items the reader folded while the
   * filter holds them open. Their ids cannot collide: a line's id is a word,
   * an item's a GitHub id.
   */
  readonly filterFolded: ReadonlySet<string>
  /** What `Ctrl-f` narrows the panel to (spec 065). Empty means everything. */
  readonly filter: string
}

/** How many rows a section has as it is drawn now; the panel answers it. */
export type SectionCounts = (section: PRInfoPanelSection) => number

/**
 * The description is what a reader came to see first, so it opens; every
 * other section waits behind a header with its count and summary, the merge
 * status naming what blocks. Once the reader has folds for the review, those
 * are handed in instead and win, the description's included (specs 067, 108).
 */
export const ARRIVAL_SECTIONS: ReadonlySet<PRInfoPanelSection> = new Set(['description'])

export function initialNav(openSections: ReadonlySet<PRInfoPanelSection> = ARRIVAL_SECTIONS): PrInfoNav {
  return {
    activeSection: 'description',
    cursorIndex: -1,
    expandedSections: new Set(openSections),
    expandedThreads: new Set(),
    expandedContent: new Set(),
    expandedCheckIds: new Set(),
    expandedPoints: new Set(['checks']),
    filterOpened: new Set(),
    filterFolded: new Set(),
    filter: "",
  }
}

function lastIndex(count: number): number {
  return count > 0 ? count - 1 : -1
}

export function maxCursorIndex(nav: PrInfoNav, counts: SectionCounts): number {
  return lastIndex(counts(nav.activeSection))
}

/** The cursor on a row the panel picked itself, such as the check whose annotation it just folded. */
export function withCursor(nav: PrInfoNav, cursorIndex: number): PrInfoNav {
  return cursorIndex === nav.cursorIndex ? nav : { ...nav, cursorIndex }
}

export function moveCursor(nav: PrInfoNav, delta: number, counts: SectionCounts): PrInfoNav {
  return withCursor(nav, Math.max(-1, Math.min(maxCursorIndex(nav, counts), nav.cursorIndex + delta)))
}

export function clampCursor(nav: PrInfoNav, counts: SectionCounts): PrInfoNav {
  return withCursor(nav, Math.min(nav.cursorIndex, maxCursorIndex(nav, counts)))
}

function sectionAt(nav: PrInfoNav, delta: number): PRInfoPanelSection {
  const index = ALL_SECTIONS.indexOf(nav.activeSection)
  return ALL_SECTIONS[(index + delta + ALL_SECTIONS.length) % ALL_SECTIONS.length]!
}

export function setActiveSection(nav: PrInfoNav, section: PRInfoPanelSection): PrInfoNav {
  if (section === nav.activeSection) return nav
  return { ...nav, activeSection: section, cursorIndex: -1 }
}

/** Tab: the next or previous section's header, wrapping. */
export function cycleSection(nav: PrInfoNav, delta: number): PrInfoNav {
  return setActiveSection(nav, sectionAt(nav, delta))
}

/** Onto the last row of the next or previous section, or its header when it is folded or empty. */
export function cycleSectionToEnd(nav: PrInfoNav, delta: number, counts: SectionCounts): PrInfoNav {
  const section = sectionAt(nav, delta)
  const cursorIndex = nav.expandedSections.has(section) ? lastIndex(counts(section)) : -1
  return { ...nav, activeSection: section, cursorIndex }
}

/**
 * One row down or up — within the section, else across into the next one.
 * Null at either end of the panel: like a buffer, it does not wrap.
 */
export function stepNav(nav: PrInfoNav, delta: 1 | -1, counts: SectionCounts): PrInfoNav | null {
  if (nav.expandedSections.has(nav.activeSection)) {
    const moved = moveCursor(nav, delta, counts)
    if (moved !== nav) return moved
  }
  const next = ALL_SECTIONS.indexOf(nav.activeSection) + delta
  if (next < 0 || next >= ALL_SECTIONS.length) return null
  return delta > 0 ? cycleSection(nav, 1) : cycleSectionToEnd(nav, -1, counts)
}

function without<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set)
  next.delete(item)
  return next
}

function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set)
  if (!next.delete(item)) next.add(item)
  return next
}

/** Folding or opening the active section makes it the reader's, whoever opened it. */
function withActiveSection(nav: PrInfoNav, expandedSections: ReadonlySet<PRInfoPanelSection>): PrInfoNav {
  return { ...nav, expandedSections, filterOpened: without(nav.filterOpened, nav.activeSection) }
}

export function collapseSection(nav: PrInfoNav): PrInfoNav {
  return withActiveSection(nav, without(nav.expandedSections, nav.activeSection))
}

export function expandSection(nav: PrInfoNav): PrInfoNav {
  return withActiveSection(nav, new Set(nav.expandedSections).add(nav.activeSection))
}

export function collapseAll(nav: PrInfoNav): PrInfoNav {
  return { ...nav, expandedSections: new Set(), filterOpened: new Set() }
}

export function expandAll(nav: PrInfoNav): PrInfoNav {
  return { ...nav, expandedSections: new Set(ALL_SECTIONS), filterOpened: new Set() }
}

/** The open sections the reader chose, which are what is kept for the review. */
export function readerSections(nav: PrInfoNav): Set<PRInfoPanelSection> {
  return new Set([...nav.expandedSections].filter((section) => !nav.filterOpened.has(section)))
}

/**
 * The nav with a new filter and its row folds settled, before any section
 * opens: what the panel refilters its rows against before `setFilter` asks
 * it for counts, so the rows it draws agree with the nav it ends up with.
 */
export function withFilter(nav: PrInfoNav, filter: string): PrInfoNav {
  if (filter === nav.filter) return nav
  // A fold made under one filter says nothing about what the next one
  // matches. A rebuilt panel starts unfiltered and is handed the app's
  // filter again, so the folds it carried over survive that first step.
  return { ...nav, filter, filterFolded: nav.filter ? new Set() : nav.filterFolded }
}

/**
 * Narrow the panel to rows containing this text, or clear it with "". A
 * filter opens every section it matches in: hiding the matches inside a
 * collapsed header would make the filter look broken.
 *
 * Which sections match is only known from the rows the new filter leaves,
 * so `counts` must already answer for it: the panel refilters its rows
 * before it asks.
 */
export function setFilter(nav: PrInfoNav, filter: string, counts: SectionCounts): PrInfoNav {
  if (filter === nav.filter) return nav
  const { filterFolded } = withFilter(nav, filter)
  let { expandedSections, filterOpened } = nav
  if (filter) {
    const opened = new Set(expandedSections)
    const byFilter = new Set(filterOpened)
    for (const section of ALL_SECTIONS) {
      if (section === 'description' || counts(section) === 0 || opened.has(section)) continue
      opened.add(section)
      byFilter.add(section)
    }
    expandedSections = opened
    filterOpened = byFilter
  }
  return clampCursor({ ...nav, filter, expandedSections, filterOpened, filterFolded }, counts)
}

/**
 * Opening a row makes it the reader's, whoever opened it before. Folding
 * one takes it from them, and while a filter is set it is kept folded
 * against the filter too, which would otherwise hold it open.
 */
function openedRow<T extends string>(nav: PrInfoNav, expanded: ReadonlySet<T>, id: T): { expanded: Set<T>; filterFolded: ReadonlySet<string> } | null {
  if (expanded.has(id) && !nav.filterFolded.has(id)) return null
  return { expanded: new Set(expanded).add(id), filterFolded: without(nav.filterFolded, id) }
}

function foldedRow<T extends string>(nav: PrInfoNav, expanded: ReadonlySet<T>, id: T): { expanded: Set<T>; filterFolded: ReadonlySet<string> } | null {
  if (!isRowOpen(expanded, id, nav.filter, nav.filterFolded)) return null
  return { expanded: without(expanded, id), filterFolded: nav.filter ? new Set(nav.filterFolded).add(id) : nav.filterFolded }
}

export function expandContent(nav: PrInfoNav, itemId: string): PrInfoNav {
  const row = openedRow(nav, nav.expandedContent, itemId)
  return row ? { ...nav, expandedContent: row.expanded, filterFolded: row.filterFolded } : nav
}

/**
 * For a row that is drawn open. A filter holds only a review's threads
 * open, never a comment's body, yet under one every id reads as open here.
 */
export function collapseContent(nav: PrInfoNav, itemId: string): PrInfoNav {
  const row = foldedRow(nav, nav.expandedContent, itemId)
  return row ? { ...nav, expandedContent: row.expanded, filterFolded: row.filterFolded } : nav
}

export function toggleCheck(nav: PrInfoNav, checkId: number): PrInfoNav {
  return { ...nav, expandedCheckIds: toggled(nav.expandedCheckIds, checkId) }
}

export function togglePoint(nav: PrInfoNav, id: MergePoint["id"]): PrInfoNav {
  return isRowOpen(nav.expandedPoints, id, nav.filter, nav.filterFolded) ? collapsePoint(nav, id) : expandPoint(nav, id)
}

export function expandPoint(nav: PrInfoNav, id: MergePoint["id"]): PrInfoNav {
  const row = openedRow(nav, nav.expandedPoints, id)
  return row ? { ...nav, expandedPoints: row.expanded, filterFolded: row.filterFolded } : nav
}

export function collapsePoint(nav: PrInfoNav, id: MergePoint["id"]): PrInfoNav {
  const row = foldedRow(nav, nav.expandedPoints, id)
  return row ? { ...nav, expandedPoints: row.expanded, filterFolded: row.filterFolded } : nav
}

/** Everything about a nav a refresh carries over to the next panel; the filter lives in app state. */
export type NavPosition = Omit<PrInfoNav, "filter">

/**
 * A captured position as a nav under the panel's own filter, holding sets
 * of its own so the position it was read from cannot change it later.
 */
export function navAt(position: NavPosition, filter: string): PrInfoNav {
  return {
    activeSection: position.activeSection,
    cursorIndex: position.cursorIndex,
    expandedSections: new Set(position.expandedSections),
    expandedThreads: new Set(position.expandedThreads),
    expandedContent: new Set(position.expandedContent),
    expandedCheckIds: new Set(position.expandedCheckIds),
    expandedPoints: new Set(position.expandedPoints),
    filterOpened: new Set(position.filterOpened),
    filterFolded: new Set(position.filterFolded),
    filter,
  }
}

/** A captured position handed to a new panel, its cursor fitted to the rows it has now. */
export function restoreNav(position: PrInfoNav, counts: SectionCounts): PrInfoNav {
  // Description rows are counted by layout, which a new panel has not had
  // yet; the cursor row is clamped where it is painted instead.
  if (position.activeSection === 'description') return position
  return clampCursor(position, counts)
}

/**
 * Every row `s` can jump to: the section headers, plus the rows of the
 * sections that are open (spec 066).
 */
export function flashTargets(nav: PrInfoNav, counts: SectionCounts): string[] {
  const ids: string[] = []
  for (const section of ALL_SECTIONS) {
    ids.push(section)
    // A label per line of prose would bury the ones worth jumping to.
    if (!nav.expandedSections.has(section) || section === 'description') continue
    const count = counts(section)
    for (let i = 0; i < count; i++) ids.push(`${section}:${i}`)
  }
  return ids
}

/** The cursor on the row a label picked; null when the id names no section. */
export function flashJumpNav(nav: PrInfoNav, id: string, counts: SectionCounts): PrInfoNav | null {
  const [name, index] = id.split(":")
  const section = ALL_SECTIONS.find((candidate) => candidate === name)
  if (!section) return null
  const cursorIndex = index === undefined ? -1 : Math.min(Number(index), lastIndex(counts(section)))
  return { ...nav, activeSection: section, cursorIndex }
}

/** `G`: the last row of the last section, or its header if it is folded. */
export function bottomTarget(nav: PrInfoNav, counts: SectionCounts): string {
  const last = ALL_SECTIONS[ALL_SECTIONS.length - 1]!
  const rows = nav.expandedSections.has(last) ? counts(last) : 0
  return rows > 0 ? `${last}:${rows - 1}` : last
}

/**
 * What a reaction under the cursor lands on (spec 042). Null where there is
 * nothing to react to: checks, files, commits, a pending reviewer, or a
 * review or thread GitHub has not given an id for.
 */
export function reactionTargetOf(
  flat: FlatConversationItem | undefined,
  section: PRInfoPanelSection,
  prNumber: number,
): ReactionTarget | null {
  if (section === 'description') return { kind: "issue", prNumber }
  if (section !== 'conversation' || !flat) return null
  switch (flat.type) {
    case 'pr-comment':
      return { kind: "issue-comment", githubId: flat.data.id }
    case 'review-header':
      return flat.data.databaseId !== undefined
        ? { kind: "review", reviewId: flat.data.databaseId, prNumber }
        : null
    case 'review-thread':
      return flat.data.githubId !== undefined
        ? { kind: "review-comment", githubId: flat.data.githubId }
        : null
    case 'pending-reviewer':
      return null
  }
}
