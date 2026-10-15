import { sliceSegments, type Segment } from "../diff-rows/segments"
import { theme } from "../theme"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLine } from "../vim-diff/types"

/** The key that opens a collapsed run, shown at the end of its label. */
export const ENTER_HINT = "↵"

export const SIGN_CELLS = 1

export function paneWidths(width: number): { left: number; right: number } {
  const left = Math.floor(width / 2)
  return { left, right: width - left }
}

/**
 * Cells for a line number, as unified's gutter lays them out, so toggling
 * views leaves the code where it was. An old number on a context line
 * counts too: unified never draws it, but the left half does, and a clipped
 * number is worse than a one-cell shift.
 */
export function gutterWidth(mapping: DiffLineMapping): number {
  let widest = 0
  for (const line of mapping.allLines) {
    if (line.type === "deletion" || line.type === "context") widest = Math.max(widest, line.oldLineNum ?? 0)
    if (line.type === "addition" || line.type === "context") widest = Math.max(widest, line.newLineNum ?? 0)
  }
  return Math.max(3, String(widest).length + 1)
}

/** Where a half's code starts: its sign cell, the number and the space after it. */
export const contentOrigin = (gutter: number) => SIGN_CELLS + gutter + 1

export function dividerLabel(line: Pick<DiffLine, "content" | "dividerKey">, expandingDivider: string | null): string {
  const count = line.content || "..."
  if (line.dividerKey && line.dividerKey === expandingDivider) return `⟳ Expanding ${count}…`
  // What it is, and the key that opens it — `za` does not, since a
  // collapsed run of context is not a fold (spec 074).
  return `▸ ${count}  ${ENTER_HINT}`
}

const SURROGATE = /[\ud800-\udbff]/

export function cellCount(segments: readonly Segment[]): number {
  let cells = 0
  for (const { text } of segments) cells += SURROGATE.test(text) ? Array.from(text).length : text.length
  return cells
}

/**
 * The cells of a line a half shows from `column` on. A marker takes the
 * cell it stands in, the way vim's `listchars` do, so a truncated line
 * cannot be mistaken for one that ends at the edge.
 */
export function halfContent(
  segments: readonly Segment[],
  column: number,
  contentWidth: number
): { segments: Segment[]; left: boolean; right: boolean } {
  const width = Math.max(contentWidth, 0)
  const cells = cellCount(segments)
  // An empty line has nothing scrolled out of view, as unified's markers have it.
  const left = column > 0 && width > 0 && cells > 0
  const right = cells > column + width && width > (left ? 1 : 0)
  const from = column + (left ? 1 : 0)
  const shown = sliceSegments(segments, from, width - (left ? 1 : 0) - (right ? 1 : 0))
  const marker = (text: string): Segment => ({ text, fg: theme.surface2, attributes: 0 })
  return {
    segments: [...(left ? [marker("‹")] : []), ...shown, ...(right ? [marker("›")] : [])],
    left,
    right,
  }
}
