import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { LineSource } from "../vim-diff/line-source"
import type { DiffLine } from "../vim-diff/types"
import { buildRows, lineOf, rowIndexByLine, type Row, type Side, type View } from "./rows"

/** What the split view's readers need off a RowLineSource. */
export interface SplitRows {
  readonly rows: readonly Row[]
  readonly side: Side
  rowAtLine(lineIndex: number): number | null
}

export function rowOfLine(line: number, source: SplitRows): number {
  return source.rowAtLine(line) ?? line
}

/**
 * The vim layer's view of one pane: an index is a row, and a row reads the
 * line on the active side. Folds and expansion build a new mapping, and the
 * caller builds a new source with it, so the rows are never invalidated.
 */
export class RowLineSource implements LineSource {
  readonly rows: readonly Row[]
  private readonly byLine: Int32Array
  private activeSide: Side

  // Comments default to the new side, so the cursor starts there too.
  constructor(
    private readonly mapping: DiffLineMapping,
    readonly view: View,
    side: Side = "right",
  ) {
    this.rows = buildRows(mapping.allLines, view)
    this.byLine = rowIndexByLine(this.rows, mapping.lineCount)
    this.activeSide = side
  }

  get side(): Side {
    return this.activeSide
  }

  setSide(side: Side): void {
    this.activeSide = side
  }

  get lineCount(): number {
    return this.rows.length
  }

  /** The mapping's line behind a row, on the active side. */
  lineIndexAt(rowIndex: number): number | undefined {
    return lineOf(this.rows[rowIndex], this.activeSide)
  }

  rowAtLine(lineIndex: number): number | null {
    const row = this.byLine[lineIndex]
    return row === undefined || row < 0 ? null : row
  }

  getLine(index: number): DiffLine | undefined {
    const line = this.lineIndexAt(index)
    return line === undefined ? undefined : this.mapping.getLine(line)
  }

  getLineContent(index: number): string {
    const line = this.lineIndexAt(index)
    return line === undefined ? "" : this.mapping.getLineContent(line)
  }

  findVisualLineForFileLine(filename: string, lineNum: number): number | null {
    const line = this.mapping.findVisualLineForFileLine(filename, lineNum)
    return line === null ? null : this.rowAtLine(line)
  }

  crossPane(direction: 1 | -1): boolean {
    if (this.view === "unified") return false
    if (direction === 1 && this.activeSide === "left") {
      this.activeSide = "right"
      return true
    }
    if (direction === -1 && this.activeSide === "right") {
      this.activeSide = "left"
      return true
    }
    return false
  }
}
