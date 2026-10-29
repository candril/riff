import type { Comment } from "../types"
import { groupIntoThreads, isThreadCollapsed, type Thread } from "../utils/threads"
import { estimatedThreadRows, type ThreadRowBudget } from "./thread-rows-estimate"

/** A thread with its fold decided, so everything that draws or labels it agrees. */
export interface WindowThread {
  thread: Thread
  collapsed: boolean
}

export interface ThreadPanelWindow {
  threads: WindowThread[]
  before: number
  after: number
}

/**
 * Decide which threads to render around the highlighted comment.
 *
 * This doubles as the panel's scroll model. The clipping viewport keeps its
 * content pinned at the top — only content near the top of the column is
 * on-screen. So we render *starting* a little above the highlighted thread:
 * that keeps it near the top of the viewport with some preceding context
 * and, because the start point follows the cursor, the view scrolls as the
 * user moves through threads with j/k. The threads kept above are at most
 * `WINDOW_LEAD`, and only as many as fit, by their estimated height, in the
 * rows the highlighted thread leaves free of the viewport, so a long thread
 * above cannot push the highlighted one past the bottom edge. They always
 * get at least a third of the viewport: a highlighted thread taller than
 * the panel is read from its top anyway, and context above it still helps.
 * Before the viewport's rows are known it keeps `WINDOW_LEAD`. `windowSize` caps how many threads mount at
 * once — the viewport clips whatever runs past the bottom, and its edge rows
 * count the threads hidden past each edge (`ThreadEdgeHints.tsx`).
 *
 * Note this is thread-granular: navigating *within* a very tall thread
 * (many replies) doesn't re-scroll, so a deep reply in an oversized
 * thread can fall below the fold. Pixel-accurate scroll-off would need a
 * panel that reads real layout offsets (cf. the file tree island).
 */
export const WINDOW_LEAD = 2

/**
 * How many threads are mounted at once. The viewport clips overflow, but
 * mounting hundreds of MarkdownRenderables is a measurable cost on first
 * paint.
 */
export function threadWindowSize(expanded: boolean): number {
  return expanded ? 80 : 24
}

export function pickVisibleThreads(
  threads: WindowThread[],
  displayOrder: Comment[],
  highlightedIndex: number,
  windowSize: number,
  budget: ThreadRowBudget
): ThreadPanelWindow {
  const highlightedId = displayOrder[highlightedIndex]?.id
  const highlightedThreadIdx = highlightedId
    ? threads.findIndex(({ thread }) => thread.comments.some((c) => c.id === highlightedId))
    : 0
  const start = Math.max(0, highlightedThreadIdx - leadAbove(threads, highlightedThreadIdx, budget))
  const end = Math.min(threads.length, start + windowSize)
  return {
    threads: threads.slice(start, end),
    before: start,
    after: threads.length - end,
  }
}

function leadAbove(threads: WindowThread[], highlightedThreadIdx: number, budget: ThreadRowBudget): number {
  if (budget.viewportRows <= 0) return WINDOW_LEAD
  const highlighted = threads[highlightedThreadIdx]
  const highlightedRows = highlighted
    ? estimatedThreadRows(highlighted.thread.comments, highlighted.collapsed, budget.textWidth)
    : 0
  const room = Math.max(Math.floor(budget.viewportRows / 3), budget.viewportRows - highlightedRows)
  let lead = 0
  let rows = 0
  while (lead < WINDOW_LEAD && highlightedThreadIdx - lead - 1 >= 0) {
    const { thread, collapsed } = threads[highlightedThreadIdx - lead - 1]!
    rows += estimatedThreadRows(thread.comments, collapsed, budget.textWidth)
    if (rows > room) break
    lead++
  }
  return lead
}

export function windowThreads(
  comments: Comment[],
  expandedThreadIds: ReadonlySet<string>,
  highlightedIndex: number,
  expanded: boolean,
  budget: ThreadRowBudget
) {
  // Resolved threads default to collapsed (scannable), everything else
  // to expanded; `expandedThreadIds` flips that default.
  const threads = groupIntoThreads(comments).map((thread) => ({
    thread,
    collapsed: isThreadCollapsed(thread, expandedThreadIds),
  }))
  // A collapsed thread is one navigable item (its root header); an
  // expanded thread exposes every comment. Must mirror
  // `getInlineCommentOverlayDisplayOrder` so j/k indices align with
  // what's drawn.
  const displayOrder = threads.flatMap(({ thread, collapsed }) => (collapsed ? [thread.comments[0]!] : thread.comments))
  const window = pickVisibleThreads(threads, displayOrder, highlightedIndex, threadWindowSize(expanded), budget)
  return { displayOrder, window }
}

/**
 * The comment rows the panel is drawing, top to bottom (spec 066).
 *
 * Flash labels what is on screen, and what is on screen is a window around
 * the highlight rather than every thread. The same window the panel draws,
 * so the two cannot disagree about which rows exist.
 */
export function visibleOverlayCommentIds(
  comments: Comment[],
  expandedThreadIds: ReadonlySet<string>,
  highlightedIndex: number,
  expanded: boolean,
  budget: ThreadRowBudget
): string[] {
  const { window } = windowThreads(comments, expandedThreadIds, highlightedIndex, expanded, budget)
  return window.threads.flatMap(({ thread, collapsed }) =>
    collapsed ? [thread.comments[0]!.id] : thread.comments.map((comment) => comment.id)
  )
}
