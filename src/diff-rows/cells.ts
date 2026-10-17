import { TAB } from "./segments"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
const ASCII = /^[\x00-\x7f]*$/

/** One grapheme per UTF-16 unit, and one cell per grapheme but the tab. */
export const isAscii = (text: string) => ASCII.test(text)

/**
 * The cells OpenTUI draws a grapheme in: a tab is as wide as TAB, anything
 * else as wide as Bun.stringWidth says — two for CJK, fullwidth forms and
 * emoji, none for a zero-width space. Skin-tone and ZWJ emoji count two, as
 * a terminal measuring by Unicode draws them; OpenTUI's wcwidth method adds
 * up their parts instead (cells.parity.test.ts names them).
 */
export const graphemeCells = (grapheme: string) => (grapheme === "\t" ? TAB.length : Bun.stringWidth(grapheme))

/**
 * Walks a line a grapheme at a time, the way buildSegments lays it into
 * cells: `units` is the grapheme's UTF-16 length, so a combining mark, a
 * variation selector or a ZWJ sequence stays with the character it
 * belongs to, and `width` is graphemeCells. A pure-ASCII line has one
 * grapheme per unit, every one a cell but the tab. Past the end each
 * column is a cell of its own, the one the cursor's block takes there.
 */
export function walkCells(
  content: string,
  stop: (column: number, cell: number, width: number, units: number) => boolean
): { column: number; cell: number } {
  let cell = 0
  if (isAscii(content)) {
    for (let column = 0; column < content.length; column++) {
      const width = content.charCodeAt(column) === 0x09 ? TAB.length : 1
      if (stop(column, cell, width, 1)) return { column, cell }
      cell += width
    }
    return { column: content.length, cell }
  }
  for (const { segment, index } of graphemes.segment(content)) {
    const width = graphemeCells(segment)
    if (stop(index, cell, width, segment.length)) return { column: index, cell }
    cell += width
  }
  return { column: content.length, cell }
}

export const cellsOf = (text: string) => walkCells(text, () => false).cell

/** The first cell a column of `content` draws in; inside a grapheme, the grapheme's. */
export function cellOfColumn(content: string, column: number): number {
  const end = walkCells(content, (at, _cell, _width, units) => column < at + units)
  return end.column < content.length ? end.cell : end.cell + Math.max(0, column - end.column)
}

/** The column whose grapheme covers `cell`: inside a wide one, its first column. */
export function columnOfCell(content: string, cell: number): number {
  const end = walkCells(content, (_column, at, width) => cell < at + width)
  return end.column < content.length ? end.column : end.column + Math.max(0, cell - end.cell)
}

/**
 * The columns of the graphemes drawn whole between cells `first` and
 * `last`, `endCol` exclusive: a wide glyph an edge cuts in half is left
 * out, since only half of it is on screen. Past the end each cell is a
 * column, as columnOfCell has it.
 */
export function wholeColumns(content: string, first: number, last: number): { startCol: number; endCol: number } {
  const start = walkCells(content, (_column, cell) => cell >= first)
  const startCol = start.column < content.length ? start.column : start.column + Math.max(0, first - start.cell)
  const end = walkCells(content, (_column, cell, width) => cell + Math.max(width, 1) - 1 > last)
  const endCol = end.column < content.length ? end.column : end.column + Math.max(0, last + 1 - end.cell)
  return { startCol, endCol: Math.max(startCol, endCol) }
}
