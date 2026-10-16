import { cellOfColumn } from "../diff-rows/cells"
import type { DiffLine, DiffLineType } from "../vim-diff/types"

// VimDiffView measures only these; a hunk header is riff's own text, so it never claims to run off an edge.
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
