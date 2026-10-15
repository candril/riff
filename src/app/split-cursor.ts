import { lineOf, type Row, type Side } from "../diff-rows/rows"
import type { VimCursorState } from "../vim-diff/types"

/** What the conversion reads off a split view's RowLineSource. */
export interface SplitRows {
  readonly rows: readonly Row[]
  readonly side: Side
  rowAtLine(lineIndex: number): number | null
}

const otherSide = (side: Side): Side => (side === "left" ? "right" : "left")

/*
 * The app keeps the cursor in mapping lines, which dozens of readers index
 * the mapping with; only the motion handler walks rows while split is shown.
 * These two convert at that one boundary. A pair row always has at least one
 * half, so a row survives the round trip even when the active half is empty.
 */

export function rowOfLine(line: number, source: SplitRows): number {
  return source.rowAtLine(line) ?? line
}

export function lineOfRow(row: number, source: SplitRows): number {
  const at = source.rows[row]
  return lineOf(at, source.side) ?? lineOf(at, otherSide(source.side)) ?? row
}

/**
 * The pane a line is drawn in when the row has a line in both halves and
 * this one is not the active side's, or null where the active side already
 * shows it. A search hit or a jump lands on a line, and the pane follows.
 */
export function paneOfLine(line: number, source: SplitRows): Side | null {
  const row = source.rows[source.rowAtLine(line) ?? -1]
  if (row?.kind !== "pair" || row.left === undefined || row.right === undefined || row.left === row.right) return null
  const side = row.left === line ? "left" : row.right === line ? "right" : null
  return side === source.side ? null : side
}

export function toRowState(state: VimCursorState, source: SplitRows): VimCursorState {
  const row = (line: number) => rowOfLine(line, source)
  return {
    ...state,
    line: row(state.line),
    selectionAnchor: state.selectionAnchor === null ? null : row(state.selectionAnchor),
    jumpList: state.jumpList.map(row),
    marks: new Map([...state.marks].map(([name, line]) => [name, row(line)])),
  }
}

/**
 * Back to lines after the motion handler ran on `rows`, which it built from
 * `before`. A row names a pair, not a half, so every index the handler left
 * on its row keeps the line it had; otherwise a mark or a jump on the
 * inactive half would drift to the active one on any motion. The cursor and
 * the selection anchor always take the active side's line: h and l cross
 * panes by switching the side under an unchanged row. The anchor's side
 * carries no meaning, since a selection is a span of rows drawn in the
 * active pane, wherever its anchor was set. A jump the handler
 * pushed is the cursor's line, and one trimmed off the front shifts the
 * rest by one.
 */
export function toLineState(rows: VimCursorState, source: SplitRows, before: VimCursorState): VimCursorState {
  const back = (row: number, ...was: (number | null | undefined)[]) =>
    was.find((line): line is number => line != null && rowOfLine(line, source) === row) ?? lineOfRow(row, source)
  return {
    ...rows,
    line: lineOfRow(rows.line, source),
    selectionAnchor: rows.selectionAnchor === null ? null : lineOfRow(rows.selectionAnchor, source),
    jumpList: rows.jumpList.map((row, i) => back(row, before.jumpList[i], before.jumpList[i + 1], before.line)),
    marks: new Map([...rows.marks].map(([name, row]) => [name, back(row, before.marks.get(name), before.line)])),
  }
}
