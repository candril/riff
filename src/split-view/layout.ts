import { sliceSegments, type Segment } from "../diff-rows/segments"
import { wrappedHeight } from "../diff-rows/visual-rows"
import { theme } from "../theme"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLine } from "../vim-diff/types"

/** The key that opens a collapsed run, shown at the end of its label. */
export const ENTER_HINT = "↵"

export const SIGN_CELLS = 1

/**
 * VimDiffView's LineNumberRenderable hands its paddingRight to Yoga as well as to
 * the gutter, so its code wraps one cell short of the pane, scrollbar or not.
 */
export const WRAP_RESERVED_CELLS = 1

/** The cells unified's code wraps at, beside a gutter that ends at `origin`. */
export const unifiedWrapWidth = (width: number, origin: number) => width - origin - WRAP_RESERVED_CELLS

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

/** The number unified's gutter shows for a line, as VimDiffView numbers it; 0 for none. */
function unifiedNumber(line: DiffLine): number {
  if (line.type === "addition" || line.type === "context") return line.newLineNum ?? 0
  if (line.type === "deletion") return line.oldLineNum ?? 0
  return 0
}

const digits = (value: number) => (value > 0 ? Math.floor(Math.log10(value)) + 1 : 1)

/**
 * The cell each line's code starts at in unified, sized as OpenTUI's
 * LineNumberRenderable sizes its gutter: a sign cell, then the wider of a
 * floor and the digits of the larger of the section's row count and its
 * largest number, plus the space before the code. The floor is four cells
 * or the widest number in the whole diff. All files gives every file
 * section its own gutter; a single file, with no header, is one section.
 *
 * `wrapWidth`, the pane's width when wrapping, makes a row of every slice,
 * as OpenTUI counts a wrapped buffer's virtual lines. Those depend on the
 * code width the gutter leaves, so the gutter widens until its digits hold
 * the rows at its own width. A wider gutter only adds rows, so this settles
 * where VimDiffView's renderer does, a frame at a time.
 */
export function unifiedOrigins(mapping: DiffLineMapping, wrapWidth?: number): (lineIndex: number) => number {
  const lines = mapping.allLines
  let widest = 0
  for (const line of lines) widest = Math.max(widest, unifiedNumber(line))
  const floor = Math.max(4, digits(widest))
  const originFor = (count: number) => SIGN_CELLS + Math.max(floor, digits(count) + 2)

  const origins = new Int32Array(lines.length)
  let start = 0
  while (start < lines.length) {
    // A file's header leads its section: the header row is drawn beside the code, not in it.
    const codeStart = lines[start]!.type === "file-header" ? start + 1 : start
    let end = codeStart
    while (end < lines.length && lines[end]!.type !== "file-header") end++
    let largest = 0
    for (let i = codeStart; i < end; i++) largest = Math.max(largest, unifiedNumber(lines[i]!))
    const rowsAt = (origin: number) => {
      if (wrapWidth === undefined) return end - codeStart
      let rows = 0
      for (let i = codeStart; i < end; i++) rows += wrappedHeight(lines[i]!, unifiedWrapWidth(wrapWidth, origin))
      return rows
    }
    let origin = originFor(Math.max(end - codeStart, largest))
    for (;;) {
      const needed = originFor(Math.max(rowsAt(origin), largest))
      if (needed <= origin) break
      origin = needed
    }
    origins.fill(origin, start, end)
    start = end
  }
  return (lineIndex) => origins[lineIndex] ?? SIGN_CELLS + floor
}

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
 * The cells a half shows of a line `lineCells` wide, scrolled to `column`:
 * `first` to `last`, inclusive. A marker takes the cell it stands in, the
 * way vim's `listchars` do, so a truncated line cannot be mistaken for one
 * that ends at the edge.
 */
export function visibleCells(column: number, contentWidth: number, lineCells: number): { first: number; last: number } {
  const width = Math.max(contentWidth, 0)
  // An empty line has nothing scrolled out of view, as unified's markers have it.
  const left = column > 0 && width > 0 && lineCells > 0
  const right = lineCells > column + width && width > (left ? 1 : 0)
  return { first: column + (left ? 1 : 0), last: column + width - 1 - (right ? 1 : 0) }
}

/** The cells of a line a half shows from `column` on, with its markers. */
export function halfContent(
  segments: readonly Segment[],
  column: number,
  contentWidth: number
): { segments: Segment[]; left: boolean; right: boolean } {
  const width = Math.max(contentWidth, 0)
  const { first, last } = visibleCells(column, width, cellCount(segments))
  const left = first > column
  const right = last < column + width - 1
  const shown = sliceSegments(segments, first, last - first + 1)
  const marker = (text: string): Segment => ({ text, fg: theme.surface2, attributes: 0 })
  return {
    segments: [...(left ? [marker("‹")] : []), ...shown, ...(right ? [marker("›")] : [])],
    left,
    right,
  }
}
