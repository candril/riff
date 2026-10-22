/**
 * The PR overview's rows read as a tree, so `l`/`h` and the `z` folds can
 * act the same way at every level (spec 067). A section's header is the
 * parent of its level-0 rows; each row knows only its depth and whether it
 * folds, and the shape follows from the order the rows are drawn in.
 */

import type { PrInfoNav } from "./pr-info-nav"
import {
  flatConversationItemId,
  isExpandablePoint,
  isFailingCheck,
  type FlatCheckItem,
  type FlatConversationItem,
  type MergeRows,
} from "./pr-info-items"

export interface RowNode {
  level: number
  foldable: boolean
  open: boolean
}

export type FoldOp = 'l' | 'h' | 'zo' | 'zc' | 'za'

/** What a fold key asks of the panel; the cursor only moves where it says. */
export type FoldIntent =
  | { openSection: true }
  | { closeSection: true }
  | { openRow: number }
  | { closeRow: number; cursor: number }
  | { cursor: number }
  | null

const leaf = (level: number): RowNode => ({ level, foldable: false, open: false })

/** Rows that never open: files, commits, previews, the description's lines. */
export function leafNodes(count: number): RowNode[] {
  return Array.from({ length: count }, () => leaf(0))
}

export function checkNodes(
  items: readonly FlatCheckItem[],
  rows: MergeRows,
  expandedCheckIds: PrInfoNav["expandedCheckIds"],
): RowNode[] {
  const levels = items.map(checkLevel)
  return items.map((item, i) => {
    switch (item.kind) {
      case 'point':
        // Read from what is drawn, not from expandedPoints: a filter opens
        // every line that holds a match without the reader opening it.
        return { level: 0, foldable: isExpandablePoint(item.point, rows), open: (levels[i + 1] ?? 0) > 0 }
      case 'check':
        return { level: 1, foldable: isFailingCheck(item.check), open: expandedCheckIds.has(item.check.id) }
      default:
        return leaf(levels[i]!)
    }
  })
}

function checkLevel(item: FlatCheckItem): number {
  switch (item.kind) {
    case 'point':
      return 0
    case 'check':
    case 'thread':
      return 1
    case 'annotation':
    case 'placeholder':
      return 2
  }
}

export function conversationNodes(
  items: readonly FlatConversationItem[],
  expandedContent: PrInfoNav["expandedContent"],
): RowNode[] {
  return items.map((item, i) => {
    const open = expandedContent.has(flatConversationItemId(item))
    switch (item.type) {
      case 'review-header': {
        const next = items[i + 1]
        // A filter shows a review's threads whether or not it was opened.
        const showsThreads = next?.type === 'review-thread' && next.parentReview === item.data
        return { level: 0, foldable: true, open: open || showsThreads }
      }
      case 'review-thread':
        return { level: 1, foldable: true, open }
      case 'pr-comment':
        return { level: 0, foldable: true, open }
      case 'pending-reviewer':
        return leaf(0)
    }
  })
}

/** The nearest row above `i` that is shallower, or -1 for the section header. */
export function parentOf(nodes: readonly RowNode[], i: number): number {
  const level = nodes[i]?.level ?? 0
  for (let j = i - 1; j >= 0; j--) if (nodes[j]!.level < level) return j
  return -1
}

export function firstChildOf(nodes: readonly RowNode[], i: number): number | null {
  const next = nodes[i + 1]
  return next && next.level > nodes[i]!.level ? i + 1 : null
}

/**
 * What a fold key does from where the cursor is, nvim's way: `l` opens a
 * fold or steps into it, `h` closes one or climbs out without closing the
 * parent, and `zc` off a fold closes the nearest open one around it.
 */
export function foldStep(nodes: readonly RowNode[], cursorIndex: number, sectionOpen: boolean, op: FoldOp): FoldIntent {
  if (cursorIndex < 0) return headerStep(nodes, sectionOpen, op)
  const node = nodes[cursorIndex]
  if (!node) return null
  const isOpenFold = node.foldable && node.open
  const isClosedFold = node.foldable && !node.open

  switch (op) {
    case 'l': {
      if (isClosedFold) return { openRow: cursorIndex }
      const child = node.open ? firstChildOf(nodes, cursorIndex) : null
      return child === null ? null : { cursor: child }
    }
    case 'h':
      return isOpenFold ? { closeRow: cursorIndex, cursor: cursorIndex } : { cursor: parentOf(nodes, cursorIndex) }
    case 'zo':
      return isClosedFold ? { openRow: cursorIndex } : null
    case 'zc':
      return isOpenFold ? { closeRow: cursorIndex, cursor: cursorIndex } : closeEnclosing(nodes, cursorIndex, sectionOpen)
    case 'za':
      if (isClosedFold) return { openRow: cursorIndex }
      if (isOpenFold) return { closeRow: cursorIndex, cursor: cursorIndex }
      return closeEnclosing(nodes, cursorIndex, sectionOpen)
  }
}

function headerStep(nodes: readonly RowNode[], sectionOpen: boolean, op: FoldOp): FoldIntent {
  switch (op) {
    case 'l':
      if (!sectionOpen) return { openSection: true }
      return nodes.length > 0 ? { cursor: 0 } : null
    case 'zo':
      return sectionOpen ? null : { openSection: true }
    case 'h':
    case 'zc':
      return sectionOpen ? { closeSection: true } : null
    case 'za':
      return sectionOpen ? { closeSection: true } : { openSection: true }
  }
}

function closeEnclosing(nodes: readonly RowNode[], i: number, sectionOpen: boolean): FoldIntent {
  for (let p = parentOf(nodes, i); p !== -1; p = parentOf(nodes, p)) {
    const parent = nodes[p]!
    if (parent.foldable && parent.open) return { closeRow: p, cursor: p }
  }
  return sectionOpen ? { closeSection: true } : null
}
