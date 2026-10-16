import { cellOfColumn } from "../diff-rows/cells"
import type { DiffLine } from "../vim-diff/types"

/**
 * How wide unwrapped unified content is: each line from its own section's
 * code origin, never narrower than a cell, and a cell of padding past it.
 * Riff's own rows count as blank lines.
 *
 * File headers are left out: a header is cut at the pane's edge and never
 * scrolls sideways, so its path cannot widen what does.
 */
export function unifiedContentWidth(lines: readonly DiffLine[], originOf: (lineIndex: number) => number): number {
  let widest = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.type === "file-header") continue
    const text = line.type === "divider" || line.type === "spacing" ? "" : line.content
    widest = Math.max(widest, originOf(i) + Math.max(1, cellOfColumn(text, text.length)) + 1)
  }
  return widest
}

/**
 * Whether the vertical scrollbar shows once the diff overflows: only while
 * unwrapped content stays under twice the pane's width. Past that the code
 * keeps the last column, and a line past the edge ends in › there.
 */
export const scrollBarFits = (paneWidth: number, contentWidth: number) => contentWidth + 1 < 2 * paneWidth
