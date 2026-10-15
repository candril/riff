import { TAB, sliceSegments, type Segment } from "../diff-rows/segments"
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

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff

/**
 * Walks a line's UTF-16 units the way buildSegments lays them into cells: a
 * tab is as wide as TAB and a surrogate pair is one cell. Past the end each
 * column is a cell of its own, the one the cursor's block takes there.
 */
function walkCells(
  content: string,
  stop: (column: number, cell: number, width: number, units: number) => boolean
): { column: number; cell: number } {
  let cell = 0
  let column = 0
  while (column < content.length) {
    const width = content[column] === "\t" ? TAB.length : 1
    const units = isHighSurrogate(content.charCodeAt(column)) && column + 1 < content.length ? 2 : 1
    if (stop(column, cell, width, units)) return { column, cell }
    column += units
    cell += width
  }
  return { column, cell }
}

/** The first cell a column of `content` draws in; inside a surrogate pair, the pair's. */
export function cellOfColumn(content: string, column: number): number {
  const end = walkCells(content, (at, _cell, _width, units) => column < at + units)
  return end.column < content.length ? end.cell : end.cell + Math.max(0, column - end.column)
}

/** The column whose character covers `cell`. */
export function columnOfCell(content: string, cell: number): number {
  const end = walkCells(content, (_column, at, width) => cell < at + width)
  return end.column < content.length ? end.column : end.column + Math.max(0, cell - end.cell)
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
