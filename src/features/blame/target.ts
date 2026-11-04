import { rowOfLine, type SplitRows } from "../../diff-rows/row-source"
import { blameSideOf, type BlameSide } from "../../providers/blame/sides"
import type { DiffFile } from "../../utils/diff-parser"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"

export interface BlameTarget {
  path: string
  side: BlameSide
  line: number
}

export interface BlameTargetInput {
  mapping: DiffLineMapping
  vim: Pick<VimCursorState, "line">
  /** The split rows the cursor moves over; unified has none. */
  rows: SplitRows | null
  files: readonly Pick<DiffFile, "filename" | "oldFilename">[]
}

const BLAMEABLE = new Set(["context", "addition", "deletion"])

/**
 * The file line under the cursor, in the revision its number counts in. A
 * selection is ignored: blame names one commit, so it reads one line.
 */
export function blameTargetOf({ mapping, vim, rows, files }: BlameTargetInput): BlameTarget | null {
  const index = rows ? halfUnderCursor(vim.line, rows) : vim.line
  const line = index === undefined ? undefined : mapping.getLine(index)
  if (!line?.filename || !BLAMEABLE.has(line.type)) return null
  const side = blameSideOf(line.type)
  const number = side === "base" ? line.oldLineNum : line.newLineNum
  if (number === undefined) return null
  return { path: side === "base" ? baseNameOf(line.filename, files) : line.filename, side, line: number }
}

/** A rename's base holds the file under its old name, as `gb` reads it. */
function baseNameOf(filename: string, files: BlameTargetInput["files"]): string {
  const file = files.find((candidate) => candidate.filename === filename)
  return file?.oldFilename ?? filename
}

function halfUnderCursor(cursor: number, rows: SplitRows): number | undefined {
  const row = rows.rows[rowOfLine(cursor, rows)]
  return row?.kind === "line" ? row.index : row?.[rows.side]
}
