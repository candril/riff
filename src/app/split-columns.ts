import { SIDE_SCROLL_OFF } from "../diff-rows/side-scroll"
import { visibleCells } from "../split-view/layout"

/**
 * Where a split pane's column window starts, worked out the way unified
 * scrolls sideways. Everything is in cells, the units a half is sliced in.
 */

// A marker hides the cell it stands in, which a window that merely spans the cursor can still put over it.
function uncover(column: number, cursorCell: number, contentWidth: number, lineCells: number): number {
  let at = column
  for (let step = 0; step < 2; step++) {
    const { first, last } = visibleCells(at, contentWidth, lineCells)
    if (cursorCell < first && at > 0) at--
    else if (cursorCell > last && first <= last) at++
    else break
  }
  return at
}

/** The column that keeps the cursor SIDE_SCROLL_OFF cells from either edge where the pane can spare them. */
export function revealColumn(column: number, cursorCell: number, contentWidth: number, lineCells: number): number {
  if (contentWidth <= 0) return column
  const margin = Math.min(SIDE_SCROLL_OFF, Math.max(0, Math.floor(contentWidth / 2) - 1))
  let next = column
  if (cursorCell < column + margin) next = Math.max(0, cursorCell - margin)
  else if (cursorCell > column + contentWidth - 1 - margin) next = cursorCell - contentWidth + 1 + margin
  return uncover(next, cursorCell, contentWidth, lineCells)
}

export const scrollBy = (column: number, delta: number) => Math.max(0, column + delta)

/** `zs` and `ze`: the cursor against the left or right edge, beside the marker rather than under it. */
export function toEdge(cursorCell: number, contentWidth: number, edge: "start" | "end", lineCells: number): number {
  if (contentWidth <= 0) return 0
  const column = edge === "start" ? cursorCell : Math.max(0, cursorCell - contentWidth + 1)
  return uncover(column, cursorCell, contentWidth, lineCells)
}

/** Half a pane, for `zH` and `zL`. */
export const halfWindow = (contentWidth: number) => Math.max(1, Math.floor(contentWidth / 2))

/**
 * The visible cell closest to the cursor, so an explicit sideways scroll
 * drags the cursor along instead of leaving it off screen; never past the
 * line's last cell.
 */
export function clampCursorCell(column: number, contentWidth: number, cursorCell: number, lineCells: number): number {
  const { first, last } = visibleCells(column, contentWidth, lineCells)
  const clamped = Math.min(Math.max(cursorCell, first), last)
  return Math.max(0, Math.min(clamped, lineCells - 1))
}
