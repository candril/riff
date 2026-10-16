import { cellOfColumn } from "../diff-rows/cells"
import type { DiffLine, DiffLineType } from "../vim-diff/types"

// The types VimDiffView's buildLineWidths (src/components/VimDiffView.ts) measures; a hunk header
// it leaves at 0, so it is never marked.
const MEASURED_TYPES = new Set<DiffLineType>(["addition", "deletion", "context", "no-newline"])

/** A line's width in cells, as unified's overflow markers measure it: 0 for a line they never mark. */
export function markedCells(line: Pick<DiffLine, "type" | "content">): number {
  return MEASURED_TYPES.has(line.type) ? cellOfColumn(line.content, line.content.length) : 0
}

/**
 * Whether an unwrapped line `lineCells` wide, scrolled to `column`, runs
 * past the code's left or right edge. Unlike split's halves, neither marker
 * costs a code cell: `‹` stands in the gutter's trailing space and `›`
 * replaces the last cell's glyph. Any sideways scroll marks every line that
 * has text, even one too short to reach the window, as VimDiffView does.
 */
export function unifiedMarkers(lineCells: number, column: number, contentWidth: number): { left: boolean; right: boolean } {
  if (lineCells <= 0 || contentWidth <= 0) return { left: false, right: false }
  return { left: column > 0, right: lineCells > column + contentWidth }
}

/**
 * The cells an unwrapped line shows from `column` on, `first` to `last`
 * inclusive. Neither marker hides one: `‹` is in the gutter, and the cell
 * under `›` is still the line's, where VimDiffView lets the cursor and
 * flash land.
 */
export function unifiedShownCells(column: number, contentWidth: number, _lineCells: number): { first: number; last: number } {
  return { first: column, last: column + Math.max(contentWidth, 0) - 1 }
}
