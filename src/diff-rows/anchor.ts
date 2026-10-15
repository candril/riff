import type { DiffLine } from "../vim-diff/types"
import { halvesOf, lineKey, lineOf, type Row, type Side } from "./rows"

export interface Anchor {
  key: string
  lineKey: string
  filename: string
  side: Side
  oldLine?: number
  newLine?: number
}

export function anchorOf(
  rows: readonly Row[],
  lines: readonly DiffLine[],
  rowIndex: number,
  side: Side,
): Anchor | undefined {
  const row = rows[rowIndex]
  const index = lineOf(row, side)
  const line = index === undefined ? undefined : lines[index]
  if (!row || !line) return undefined
  return {
    key: row.key,
    lineKey: lineKey(lines, index!),
    filename: line.filename ?? "",
    side,
    oldLine: line.oldLineNum,
    newLine: line.newLineNum,
  }
}

type Field = "oldLineNum" | "newLineNum"

// The anchor's own number: the new side for additions and context, the old
// side for deletions, which have no new number.
function numberOf(anchor: Anchor): { field: Field; value: number } | undefined {
  if (anchor.newLine !== undefined) return { field: "newLineNum", value: anchor.newLine }
  if (anchor.oldLine !== undefined) return { field: "oldLineNum", value: anchor.oldLine }
  return undefined
}

function preferredHalves(row: Row, side: Side): number[] {
  if (row.kind === "line") return [row.index]
  const first = side === "left" ? row.left : row.right
  const second = side === "left" ? row.right : row.left
  return [first, second].filter((index): index is number => index !== undefined)
}

// Finds the row an anchor now lives on: the same key; else a row with a half
// showing the same line, which is what a toggle needs since a changed pair's
// key differs from its lines' keys and a "\ No newline" marker has no number
// to fall back on; else the row showing the same file line number; else the
// nearest row at or above it in its file, which is a fold standing for it or
// the edge of a collapsed region; else the file's header, its lines collapsed
// away; else the top.
export function findAnchor(
  rows: readonly Row[],
  lines: readonly DiffLine[],
  anchor: Anchor,
): number {
  if (rows.length === 0) return -1
  const exact = rows.findIndex((row) => row.key === anchor.key)
  if (exact >= 0) return exact
  const sameLine = rows.findIndex((row) =>
    halvesOf(row).some((index) => lineKey(lines, index) === anchor.lineKey),
  )
  if (sameLine >= 0) return sameLine

  const inFile = (index: number) => (lines[index]?.filename ?? "") === anchor.filename
  const number = numberOf(anchor)
  if (number) {
    const { field, value } = number
    for (const pass of [0, 1]) {
      const same = rows.findIndex((row) => {
        const index = preferredHalves(row, anchor.side)[pass]
        return index !== undefined && inFile(index) && lines[index]![field] === value
      })
      if (same >= 0) return same
    }

    for (let r = rows.length - 1; r >= 0; r--) {
      const atOrAbove = halvesOf(rows[r]!).some((index) => {
        const n = lines[index]?.[field]
        return inFile(index) && n !== undefined && n <= value
      })
      if (atOrAbove) return r
    }
  }

  const header = rows.findIndex((row) => {
    const index = lineOf(row, anchor.side)
    return index !== undefined && lines[index]?.type === "file-header" && inFile(index)
  })
  return header >= 0 ? header : 0
}
