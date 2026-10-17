import { cellOfColumn, walkCells } from "../diff-rows/cells"
import { SIDE_SCROLL_OFF } from "../diff-rows/side-scroll"
import { visibleCells } from "../split-view/layout"

/**
 * Where a split pane's column window starts, worked out the way unified
 * scrolls sideways. Everything is in cells, the units a half is sliced in.
 */

/**
 * The cells a window shows of a line. A split half's markers each hide a
 * cell; unified's `‹` stands in the gutter instead, so it passes its own.
 */
export type ShownCells = typeof visibleCells

// A marker hides the cell it stands in, which a window that merely spans the cursor can still put over it.
function uncover(column: number, cursorCell: number, contentWidth: number, lineCells: number, shown: ShownCells): number {
  let at = column
  for (let step = 0; step < 2; step++) {
    const { first, last } = shown(at, contentWidth, lineCells)
    if (cursorCell < first && at > 0) at--
    else if (cursorCell > last && first <= last) at++
    else break
  }
  return at
}

/** The column that keeps the cursor SIDE_SCROLL_OFF cells from either edge where the pane can spare them. */
export function revealColumn(
  column: number,
  cursorCell: number,
  contentWidth: number,
  lineCells: number,
  shown: ShownCells = visibleCells
): number {
  if (contentWidth <= 0) return column
  const margin = Math.min(SIDE_SCROLL_OFF, Math.max(0, Math.floor(contentWidth / 2) - 1))
  let next = column
  if (cursorCell < column + margin) next = Math.max(0, cursorCell - margin)
  else if (cursorCell > column + contentWidth - 1 - margin) next = cursorCell - contentWidth + 1 + margin
  return uncover(next, cursorCell, contentWidth, lineCells, shown)
}

export const scrollBy = (column: number, delta: number) => Math.max(0, column + delta)

/** `zs` and `ze`: the cursor against the left or right edge, beside the marker rather than under it. */
export function toEdge(
  cursorCell: number,
  contentWidth: number,
  edge: "start" | "end",
  lineCells: number,
  shown: ShownCells = visibleCells
): number {
  if (contentWidth <= 0) return 0
  const column = edge === "start" ? cursorCell : Math.max(0, cursorCell - contentWidth + 1)
  return uncover(column, cursorCell, contentWidth, lineCells, shown)
}

/** Half a pane, for `zH` and `zL`. */
export const halfWindow = (contentWidth: number) => Math.max(1, Math.floor(contentWidth / 2))

/**
 * The visible cell closest to the cursor, so an explicit sideways scroll
 * drags the cursor along instead of leaving it off screen; never past the
 * line's last cell.
 */
export function clampCursorCell(
  column: number,
  contentWidth: number,
  cursorCell: number,
  lineCells: number,
  shown: ShownCells = visibleCells
): number {
  const { first, last } = shown(column, contentWidth, lineCells)
  const clamped = Math.min(Math.max(cursorCell, first), last)
  return Math.max(0, Math.min(clamped, lineCells - 1))
}

/** The grapheme of `content` that draws in `cell`; past the end each cell is a column of its own. */
function graphemeAt(content: string, cell: number): { column: number; cell: number; width: number } {
  let width = 1
  const end = walkCells(content, (_column, at, cells) => {
    width = cells
    return cell < at + cells
  })
  return end.column < content.length ? { ...end, width } : { column: end.column + cell - end.cell, cell, width: 1 }
}

/**
 * clampCursorCell for a column of `content`. A wide glyph the window cuts
 * would show only part of the cursor's block, or none of it once the cell
 * maps back to the glyph's first column, so the cursor steps to the
 * grapheme after it at the left edge and the one before it at the right,
 * when that one is shown whole.
 */
export function cursorColumnInWindow(
  content: string,
  column: number,
  contentWidth: number,
  col: number,
  lineCells: number,
  shown: ShownCells = visibleCells
): number {
  const { first, last } = shown(column, contentWidth, lineCells)
  const whole = (at: { cell: number; width: number }) => at.cell >= first && at.cell + at.width - 1 <= last
  const at = graphemeAt(content, clampCursorCell(column, contentWidth, cellOfColumn(content, col), lineCells, shown))
  if (whole(at)) return at.column
  const neighbour = at.cell < first ? graphemeAt(content, at.cell + at.width) : at.cell > 0 ? graphemeAt(content, at.cell - 1) : at
  return whole(neighbour) ? neighbour.column : at.column
}
