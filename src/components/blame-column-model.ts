import { cellsOf, walkCells } from "../diff-rows/cells"
import type { Row } from "../diff-rows/rows"
import type { BlameColumnState } from "../features/blame/column-state"
import { blameSideOf, type BlameSide } from "../providers/blame/sides"
import type { BlameLine } from "../providers/blame/types"
import type { DiffLine } from "../vim-diff/types"

const SHA_CELLS = 8
const AUTHOR_CELLS = 8
/** A short sha, a space, the author cut to fit and a space before the line number. */
export const BLAME_CELLS = SHA_CELLS + 1 + AUTHOR_CELLS + 1

const BLANK = " ".repeat(BLAME_CELLS)

export type BlamePick = BlameLine | "loading" | undefined

const isCode = (line: DiffLine) =>
  (line.type === "context" || line.type === "addition" || line.type === "deletion") && !line.blockFoldId

/** Wide characters count two cells, so a name is cut by cells rather than by characters. */
function fitCells(text: string, cells: number): string {
  const { column } = walkCells(text, (_column, cell, width) => cell + width > cells)
  const cut = text.slice(0, column)
  return cut + " ".repeat(cells - cellsOf(cut))
}

const padded = (text: string) => fitCells(text, BLAME_CELLS)

function cellOf(blame: BlameLine): string {
  if (blame.kind === "uncommitted") return padded("uncommitted")
  const { shortSha, author } = blame.commit
  return `${fitCells(shortSha, SHA_CELLS)} ${fitCells(author, AUTHOR_CELLS)} `
}

const runKeyOf = (blame: BlameLine) => (blame.kind === "uncommitted" ? "uncommitted" : blame.commit.sha)

/**
 * What the blame column draws beside each of a pane's lines, in order. A
 * run of lines from one commit names it once, as a reader scans down the
 * column for where the author changes; any row that is not code ends the
 * run, so every hunk names its first commit again rather than leaving the
 * reader to scroll up past the header for it.
 */
export function blameColumnCells(lines: readonly DiffLine[], pick: (line: DiffLine) => BlamePick): string[] {
  let run: string | null = null
  let loadingFile: string | undefined | null = null
  return lines.map((line) => {
    if (!isCode(line)) {
      run = null
      return BLANK
    }
    const blame = pick(line)
    if (blame === "loading") {
      run = null
      if (loadingFile === line.filename) return BLANK
      loadingFile = line.filename
      return padded("…")
    }
    if (!blame) {
      run = null
      return BLANK
    }
    const key = runKeyOf(blame)
    if (key === run) return BLANK
    run = key
    return cellOf(blame)
  })
}

export type BlameView = "unified" | "split"
export type BlamePane = "left" | "right"

/**
 * The side and line number a row blames. Split's halves blame the side
 * whose numbers they draw; unified draws one row per line, so the line's
 * own type decides, as gb's peek does.
 */
export function blameSideFor(
  view: BlameView,
  pane: BlamePane | null,
  line: DiffLine,
): { side: BlameSide; line: number } | null {
  const side: BlameSide = view === "split" ? (pane === "left" ? "base" : "head") : blameSideOf(line.type)
  const number = side === "base" ? line.oldLineNum : line.newLineNum
  return number === undefined ? null : { side, line: number }
}

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
