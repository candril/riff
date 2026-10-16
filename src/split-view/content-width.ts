import { cellOfColumn } from "../diff-rows/cells"
import type { DiffLine } from "../vim-diff/types"

/**
 * How wide VimDiffView's unwrapped ScrollBox content lays out: each file's
 * code renderable is as wide as its widest line and never narrower than a
 * cell, beside its gutter and the padding LineNumberRenderable hands Yoga.
 * Riff's own rows count as the blank lines VimDiffView gives its parser.
 *
 * File headers are left out. VimDiffView wraps a header's path to the
 * viewport, so a header only outgrows twice the pane when the pane is
 * narrower than a dozen cells or so plus the counts, where the two views'
 * headers already part ways.
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
 * Whether VimDiffView's vertical scrollbar lands on screen once the diff
 * overflows. Its ScrollBox shares the pane between the content and the
 * one-cell bar by flex-shrink, in proportion to their widths, so content
 * nearly twice the pane wide leaves the bar half a cell or less. Yoga rounds
 * that past the pane's edge, and the content keeps the pane's full width.
 */
export const scrollBarFits = (paneWidth: number, contentWidth: number) => contentWidth + 1 < 2 * paneWidth
