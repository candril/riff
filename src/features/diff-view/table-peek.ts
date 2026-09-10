/**
 * The table under the cursor, taken from the diff.
 *
 * One side at a time: a table's deleted rows belong to the version being
 * replaced, and mixing them into one grid would show a table that never
 * existed. The peek opens on the version the change arrives at, and `Tab`
 * asks for the one it replaces (spec 058).
 */

import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { findTableBlock, isDelimiterRow, splitRow } from "../../utils/markdown-tables"
import { renderMarkdownTable, type TableModel } from "../../utils/markdown-table-render"
import type { CellAlignment } from "../../utils/markdown-tables"
import { onSide, type DiffSide } from "../../utils/fenced-blocks"

export interface PeekedTable {
  lines: string[]
  rowCount: number
  side: DiffSide
  /** Whether the other side has a different table to show. */
  hasOther: boolean
}

export function buildTablePeek(
  mapping: DiffLineMapping,
  line: number,
  width: number,
  side: DiffSide = "new",
): PeekedTable | null {
  const block = findTableBlock(mapping.allLines, line)
  if (!block) return null

  // A table added or deleted whole has nothing on the other side; asking for
  // it shows the version that does exist rather than an empty grid.
  const shown = rowsOn(mapping, block, side).length > 0 ? side : other(side)
  const model = toModel(mapping, rowsOn(mapping, block, shown))
  if (!model) return null

  // Only a changed table has a second version worth switching to: one that
  // nothing touched reads the same on both sides.
  const changed = block.some((index) => {
    const type = mapping.getLine(index)?.type
    return type === "addition" || type === "deletion"
  })

  return {
    lines: renderMarkdownTable(model, width),
    rowCount: model.rows.length + 1,
    side: shown,
    hasOther: changed && rowsOn(mapping, block, other(shown)).length > 0,
  }
}

function other(side: DiffSide): DiffSide {
  return side === "new" ? "old" : "new"
}

function rowsOn(mapping: DiffLineMapping, block: number[], side: DiffSide): number[] {
  return block.filter((index) => {
    const line = mapping.getLine(index)
    return line !== undefined && onSide(line, side)
  })
}

function toModel(mapping: DiffLineMapping, indices: number[]): TableModel | null {
  const rows: string[][] = []
  let alignments: CellAlignment[] = []

  for (const index of indices) {
    const line = mapping.getLine(index)
    if (!line) continue

    // The file's own text: the diff may be showing it padded onto a grid.
    const { cells } = splitRow(line.sourceContent ?? line.content)
    if (isDelimiterRow(cells)) {
      alignments = cells.map(alignmentOf)
      continue
    }
    rows.push(cells)
  }

  const [header, ...body] = rows
  if (!header) return null

  return {
    header,
    rows: body,
    alignments: alignments.length ? alignments : header.map(() => "default"),
  }
}

function alignmentOf(cell: string): CellAlignment {
  const left = cell.startsWith(":")
  const right = cell.endsWith(":")
  return left && right ? "center" : right ? "right" : left ? "left" : "default"
}
