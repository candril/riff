import type { DiffLine, DiffLineType } from "../vim-diff/types"
import { columnOfCell } from "./cells"
import type { Row } from "./rows"
import { wrapLine, type WrapSlice } from "./wrap"

/**
 * The lines unified puts in its code buffer, and so the ones OpenTUI wraps
 * there. Chrome is drawn beside the buffer and stays one row; a pair row is
 * split's, which never wraps.
 */
const WRAPPING_TYPES = new Set<DiffLineType>(["context", "addition", "deletion", "no-newline", "hunk-header"])

export interface VisualRow {
  row: number
  /** Null for a row that does not wrap. */
  slice: WrapSlice | null
  /** Every slice after a line's first. */
  continuation: boolean
}

/** Rows of differing heights, addressed by the visual row they start on. */
export interface VisualRows {
  total: number
  firstOf(row: number): number
  heightOf(row: number): number
  /** With no rows at all, `{ row: -1, slice: null, continuation: false }`: there is no row to report. */
  at(visual: number): VisualRow
  /**
   * The visual row that draws `col` of a row: the first slice whose drawn
   * cells end after it, so whitespace hanging past the edge belongs to the
   * next slice, where the cursor can be shown. A column past the line's end
   * stays on its last slice; a row past the end is placed where firstOf
   * puts it.
   */
  ofColumn(row: number, col: number): { visual: number; slice: WrapSlice | null }
  /** Null for a row that does not wrap. */
  slicesOf(row: number): readonly WrapSlice[] | null
}

export interface VisualRowsOptions {
  /**
   * Split always passes false: at half width a line and its partner wrap to
   * different heights, and the panes would lose their alignment (spec 100,
   * Out of Scope).
   */
  wrap: boolean
  /** Per line, since unified's all-files gutter, and so its code width, is per file section. */
  widthOf: (lineIndex: number) => number
}

export function buildVisualRows(
  rows: readonly Row[],
  lines: readonly DiffLine[],
  opts: VisualRowsOptions
): VisualRows {
  return opts.wrap ? wrapped(rows, lines, opts.widthOf) : unwrapped(rows.length)
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max))

const NO_ROW: VisualRow = { row: -1, slice: null, continuation: false }

function unwrapped(count: number): VisualRows {
  return {
    total: count,
    firstOf: (row) => clamp(row, count),
    heightOf: (row) => (row >= 0 && row < count ? 1 : 0),
    at: (visual) => (count === 0 ? NO_ROW : { row: clamp(visual, count - 1), slice: null, continuation: false }),
    ofColumn: (row) => ({ visual: clamp(row, count), slice: null }),
    slicesOf: () => null,
  }
}

function slicesFor(row: Row, lines: readonly DiffLine[], widthOf: (lineIndex: number) => number): WrapSlice[] | null {
  if (row.kind !== "line") return null
  const line = lines[row.index]
  return line && WRAPPING_TYPES.has(line.type) ? wrapLine(line.content, widthOf(row.index)) : null
}

const contentOf = (row: Row, lines: readonly DiffLine[]) => (row.kind === "line" ? lines[row.index]?.content ?? "" : "")

function wrapped(rows: readonly Row[], lines: readonly DiffLine[], widthOf: (lineIndex: number) => number): VisualRows {
  const slices: (WrapSlice[] | null)[] = new Array(rows.length)
  const first = new Int32Array(rows.length + 1)
  for (let row = 0; row < rows.length; row++) {
    const own = slicesFor(rows[row]!, lines, widthOf)
    slices[row] = own
    first[row + 1] = first[row]! + (own?.length ?? 1)
  }
  const total = first[rows.length]!
  const firstOf = (row: number) => first[clamp(row, rows.length)]!

  return {
    total,
    firstOf,
    heightOf: (row) => (row >= 0 && row < rows.length ? first[row + 1]! - first[row]! : 0),
    at(visual) {
      if (total === 0) return NO_ROW
      const target = clamp(visual, total - 1)
      let low = 0
      let high = rows.length - 1
      while (low < high) {
        const mid = (low + high + 1) >> 1
        if (first[mid]! <= target) low = mid
        else high = mid - 1
      }
      const offset = target - first[low]!
      return { row: low, slice: slices[low]?.[offset] ?? null, continuation: offset > 0 }
    },
    ofColumn(row, col) {
      const own = slices[row]
      if (!own) return { visual: firstOf(row), slice: null }
      const content = contentOf(rows[row]!, lines)
      const drawnEnd = (slice: WrapSlice) => columnOfCell(content, slice.startCell + Math.max(1, slice.cells))
      let offset = 0
      while (offset < own.length - 1 && col >= drawnEnd(own[offset]!)) offset++
      return { visual: firstOf(row) + offset, slice: own[offset]! }
    },
    slicesOf: (row) => slices[row] ?? null,
  }
}
