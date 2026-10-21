import type { PRInfoPanelSection } from "../state"
import type { ReactionTarget } from "../types"
import { ALL_SECTIONS, type FlatConversationItem } from "./pr-info-items"

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
  /** What `Ctrl-f` narrows the panel to (spec 065). Empty means everything. */
  readonly filter: string
}

/** How many rows a section has as it is drawn now; the panel answers it. */
export type SectionCounts = (section: PRInfoPanelSection) => number

export function initialNav(): PrInfoNav {
  return {
    activeSection: 'description',
    cursorIndex: -1,
    // Sections are collapsed on arrival but for the description: the panel's
    // job is to say what there is — headers with their counts and a summary
    // each — and let you open the one you came for, while the one thing you
    // always want is what the PR says it does (specs 062, 067).
    expandedSections: new Set(['description']),
    expandedThreads: new Set(),
    expandedContent: new Set(),
    expandedCheckIds: new Set(),
    filter: "",
  }
}

function lastIndex(count: number): number {
  return count > 0 ? count - 1 : -1
}

export function maxCursorIndex(nav: PrInfoNav, counts: SectionCounts): number {
  return lastIndex(counts(nav.activeSection))
}

function withCursor(nav: PrInfoNav, cursorIndex: number): PrInfoNav {
  return cursorIndex === nav.cursorIndex ? nav : { ...nav, cursorIndex }
}

export function moveCursor(nav: PrInfoNav, delta: number, counts: SectionCounts): PrInfoNav {
  return withCursor(nav, Math.max(-1, Math.min(maxCursorIndex(nav, counts), nav.cursorIndex + delta)))
}

export function clampCursor(nav: PrInfoNav, counts: SectionCounts): PrInfoNav {
  return withCursor(nav, Math.min(nav.cursorIndex, maxCursorIndex(nav, counts)))
}

/**
 * Section header highlight only changes when the cursor crosses the header /
 * item boundary — a move that does not can skip the rebuild, so j/k inside a
 * section doesn't tear down + rebuild every renderable (which causes visible
 * flicker on markdown bodies in particular).
 */
export function crossedHeader(before: PrInfoNav, after: PrInfoNav): boolean {
  return (before.cursorIndex === -1) !== (after.cursorIndex === -1)
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

function withSections(nav: PrInfoNav, expandedSections: ReadonlySet<PRInfoPanelSection>): PrInfoNav {
  return { ...nav, expandedSections }
}

function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set)
  if (!next.delete(item)) next.add(item)
  return next
}

export function toggleSection(nav: PrInfoNav): PrInfoNav {
  return withSections(nav, toggled(nav.expandedSections, nav.activeSection))
}

export function collapseSection(nav: PrInfoNav): PrInfoNav {
  const next = new Set(nav.expandedSections)
  next.delete(nav.activeSection)
  return withSections(nav, next)
}

export function expandSection(nav: PrInfoNav): PrInfoNav {
  return withSections(nav, new Set(nav.expandedSections).add(nav.activeSection))
}

export function collapseAll(nav: PrInfoNav): PrInfoNav {
  return withSections(nav, new Set())
}

export function expandAll(nav: PrInfoNav): PrInfoNav {
  return withSections(nav, new Set(ALL_SECTIONS))
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
  let expandedSections = nav.expandedSections
  if (filter) {
    const opened = new Set(expandedSections)
    for (const section of ALL_SECTIONS) {
      if (section !== 'description' && counts(section) > 0) opened.add(section)
    }
    expandedSections = opened
  }
  return clampCursor({ ...nav, filter, expandedSections }, counts)
}

export function toggleContent(nav: PrInfoNav, itemId: string): PrInfoNav {
  return { ...nav, expandedContent: toggled(nav.expandedContent, itemId) }
}

export function expandContent(nav: PrInfoNav, itemId: string): PrInfoNav {
  if (nav.expandedContent.has(itemId)) return nav
  return { ...nav, expandedContent: new Set(nav.expandedContent).add(itemId) }
}

export function collapseContent(nav: PrInfoNav, itemId: string): PrInfoNav {
  if (!nav.expandedContent.has(itemId)) return nav
  const expandedContent = new Set(nav.expandedContent)
  expandedContent.delete(itemId)
  return { ...nav, expandedContent }
}

export function toggleCheck(nav: PrInfoNav, checkId: number): PrInfoNav {
  return { ...nav, expandedCheckIds: toggled(nav.expandedCheckIds, checkId) }
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
