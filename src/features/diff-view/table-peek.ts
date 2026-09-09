/**
 * The table under the cursor, taken from the diff.
 *
 * The new side only: a table's deleted rows belong to the version being
 * replaced, and mixing them into one grid would show a table that never
 * existed. What is rendered is what the file will say.
 */

import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { findTableBlock, isDelimiterRow, splitRow } from "../../utils/markdown-tables"
import { renderMarkdownTable, type TableModel } from "../../utils/markdown-table-render"
import type { CellAlignment } from "../../utils/markdown-tables"

export interface PeekedTable {
  lines: string[]
  rowCount: number
}

export function buildTablePeek(
  mapping: DiffLineMapping,
  line: number,
  width: number
): PeekedTable | null {
  const block = findTableBlock(mapping.allLines, line)
  if (!block) return null

  const rows: string[][] = []
  let alignments: CellAlignment[] = []

  for (const index of block) {
    const source = mapping.getLine(index)
    if (!source || source.type === "deletion") continue

    // The file's own text: the diff may be showing it padded onto a grid.
    const { cells } = splitRow(source.sourceContent ?? source.content)
    if (isDelimiterRow(cells)) {
      alignments = cells.map(alignmentOf)
      continue
    }
    rows.push(cells)
  }

  if (rows.length === 0) return null

  const [header, ...body] = rows
  const model: TableModel = {
    header: header!,
    rows: body,
    alignments: alignments.length ? alignments : header!.map(() => "default"),
  }

  return { lines: renderMarkdownTable(model, width), rowCount: rows.length }
}

function alignmentOf(cell: string): CellAlignment {
  const left = cell.startsWith(":")
  const right = cell.endsWith(":")
  return left && right ? "center" : right ? "right" : left ? "left" : "default"
}
