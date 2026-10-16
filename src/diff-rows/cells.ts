import { TAB } from "./segments"

export const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff

/**
 * Walks a line's UTF-16 units the way buildSegments lays them into cells: a
 * tab is as wide as TAB and a surrogate pair is one cell. Past the end each
 * column is a cell of its own, the one the cursor's block takes there.
 */
export function walkCells(
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
