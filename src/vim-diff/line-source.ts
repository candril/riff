import type { DiffLine } from "./types"

/**
 * What the vim layer reads: lines by index. It does not care whether an
 * index is a unified line or a split row, so any view can hand it one.
 */
export interface LineSource {
  readonly lineCount: number
  getLine(index: number): DiffLine | undefined
  getLineContent(index: number): string
  findVisualLineForFileLine(filename: string, lineNum: number): number | null
  /** Optional because only a split source has a second pane to cross into. */
  crossPane?(direction: 1 | -1): boolean
}
