import { BLAME_CELLS, blameColumnCells, blameSideFor, type BlamePick } from "../components/blame-column-model"
import type { Row } from "../diff-rows/rows"
import type { BlameColumnState } from "../features/blame/column-state"
import type { DiffLine } from "../vim-diff/types"

export type BlameView = "unified" | "split"
export type BlamePane = "left" | "right"
export type BlameColumns = ReadonlyMap<string, BlameColumnState>

/** The cells beside a line: the column's width where its file has one turned on, else none. */
export const blameWidthIn = (columns: BlameColumns, line: DiffLine | undefined) =>
  line?.filename !== undefined && columns.has(line.filename) ? BLAME_CELLS : 0

function pickIn(columns: BlameColumns, view: BlameView, pane: BlamePane | null) {
  return (line: DiffLine): BlamePick => {
    const column = line.filename === undefined ? undefined : columns.get(line.filename)
    if (!column) return undefined
    if (column.status === "loading") return "loading"
    const at = blameSideFor(view, pane, line)
    return at ? column[at.side]?.[at.line] : undefined
  }
}

/** Unified's column, by line index; only lines whose file has the column on have a cell. */
export function unifiedBlameCells(lines: readonly DiffLine[], columns: BlameColumns): ReadonlyMap<number, string> {
  const cells = new Map<number, string>()
  if (columns.size === 0) return cells
  const drawn = blameColumnCells(lines, pickIn(columns, "unified", null))
  lines.forEach((line, index) => {
    if (blameWidthIn(columns, line) > 0) cells.set(index, drawn[index]!)
  })
  return cells
}

/**
 * One split pane's column, by line index. A half left empty opposite the
 * other side's line is no row of this pane's, so it does not end a run;
 * a row across both panes does.
 */
export function splitBlameCells(
  rows: readonly Row[],
  lines: readonly DiffLine[],
  columns: BlameColumns,
  pane: BlamePane,
): ReadonlyMap<number, string> {
  const cells = new Map<number, string>()
  if (columns.size === 0) return cells
  const indices = rows.flatMap((row) => {
    const index = row.kind === "line" ? row.index : row[pane]
    return index === undefined ? [] : [index]
  })
  const drawn = blameColumnCells(
    indices.map((index) => lines[index]!),
    pickIn(columns, "split", pane),
  )
  indices.forEach((index, at) => {
    if (blameWidthIn(columns, lines[index]) > 0) cells.set(index, drawn[at]!)
  })
  return cells
}
