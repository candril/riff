import type { DiffLine, DiffLineType } from "../vim-diff/types"
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
  at(visual: number): VisualRow
  /** The visual row that draws `col` of a row; a column past the line's end stays on its last slice. */
  ofColumn(row: number, col: number): { visual: number; slice: WrapSlice | null }
  /** Null for a row that does not wrap. */
  slicesOf(row: number): readonly WrapSlice[] | null
}

export interface VisualRowsOptions {
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

function unwrapped(count: number): VisualRows {
  return {
    total: count,
    firstOf: (row) => clamp(row, count),
    heightOf: (row) => (row >= 0 && row < count ? 1 : 0),
    at: (visual) => ({ row: clamp(visual, count - 1), slice: null, continuation: false }),
    ofColumn: (row) => ({ visual: clamp(row, count), slice: null }),
    slicesOf: () => null,
  }
}

function slicesFor(row: Row, lines: readonly DiffLine[], widthOf: (lineIndex: number) => number): WrapSlice[] | null {
  if (row.kind !== "line") return null
  const line = lines[row.index]
  return line && WRAPPING_TYPES.has(line.type) ? wrapLine(line.content, widthOf(row.index)) : null
}

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
      let offset = 0
      while (offset < own.length - 1 && col >= own[offset]!.endCol) offset++
      return { visual: firstOf(row) + offset, slice: own[offset]! }
    },
    slicesOf: (row) => slices[row] ?? null,
  }
}
