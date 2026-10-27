import { RowLineSource } from "../../diff-rows/row-source"
import { lineNumOn, type DiffLineMapping, type FileSide } from "../../vim-diff/line-mapping"
import type { LineSource } from "../../vim-diff/line-source"
import type { FileParse } from "../../vim-diff/file-parses"
import {
  bracketFrom,
  lineStarts,
  matchBracket,
  offsetOf,
  positionOf,
  skippedRanges,
  type TextRange,
} from "../../vim-diff/matching-bracket"

export interface MatchingBracketDeps {
  /** The rows the cursor walks: a split pane's, or the mapping's own lines. */
  getSource: () => LineSource
  getMapping: () => DiffLineMapping
  parse: (filename: string) => FileParse | undefined
  /** The file's text as read, for when it has not been parsed (yet, or at all). */
  fileText: (filename: string, side: FileSide) => string | null
  /** Opens a collapsed run for good and rebuilds the mapping, synchronously: the file is already read. */
  expandDivider: (dividerKey: string) => void
  loadFileContent: (filename: string) => void
  toast: (message: string) => void
}

export type BracketTarget = { row: number; col: number }
export type BracketResolver = (row: number, col: number) => BracketTarget | null

export const SHOWN_LINES_NOTE = "Matched within the shown lines: the file's text is still loading"
export const SHOWN_LINES_MISS = "No match within the shown lines: the file's text is still loading"

interface Rows {
  lineAt(row: number): number | undefined
  rowAt(line: number): number | null
  /** The version of the file the row reads; the pane decides it in split. */
  side(line: DiffLineMapping["allLines"][number]): FileSide
}

function rowsOf(source: LineSource): Rows {
  if (source instanceof RowLineSource && source.view === "split") {
    const side: FileSide = source.side === "left" ? "old" : "new"
    return { lineAt: (row) => source.lineIndexAt(row), rowAt: (line) => source.rowAtLine(line), side: () => side }
  }
  return {
    lineAt: (row) => row,
    rowAt: (line) => line,
    side: (line) => (line.type === "deletion" ? "old" : "new"),
  }
}

/**
 * `%` (spec 012): the bracket that pairs with the one at or after the
 * cursor, found in the whole file rather than the fragment the diff shows,
 * and the row to put the cursor on. Rows are the current source's, read
 * again after a collapsed run had to be opened to show the match.
 */
export function createMatchingBracketResolver(deps: MatchingBracketDeps): BracketResolver {
  function wholeText(filename: string, side: FileSide): { text: string; skipped: TextRange[] } | null {
    const parsed = deps.parse(filename)?.[side]
    if (parsed) return { text: parsed.content, skipped: skippedRanges(parsed.highlights) }
    const text = deps.fileText(filename, side)
    return text === null ? null : { text, skipped: [] }
  }

  /** The mapping line showing `lineNum`, opening the run it is collapsed in if need be. */
  function lineShowing(filename: string, side: FileSide, lineNum: number): { line: number; exact: boolean } | null {
    const found = deps.getMapping().findVisualLineForFileLine(filename, lineNum, side)
    if (found !== null) return { line: found, exact: true }

    const dividerKey = deps.getMapping().findDividerForLine(filename, lineNum, side)
    if (dividerKey) {
      deps.expandDivider(dividerKey)
      const opened = deps.getMapping().findVisualLineForFileLine(filename, lineNum, side)
      if (opened !== null) return { line: opened, exact: true }
    }

    // Folded away (a file or a fenced block): the fold's own row stands for it.
    const lines = deps.getMapping().allLines
    let fold: number | null = null
    let foldNum = 0
    for (let index = 0; index < lines.length; index++) {
      const num = lines[index]!.filename === filename ? lineNumOn(lines[index]!, side) : undefined
      if (num !== undefined && num < lineNum && num >= foldNum) {
        fold = index
        foldNum = num
      }
    }
    return fold === null ? null : { line: fold, exact: false }
  }

  function inWholeFile(filename: string, side: FileSide, lineNum: number, col: number, bracket: string) {
    const whole = wholeText(filename, side)
    if (!whole) return undefined
    const starts = lineStarts(whole.text)
    const offset = offsetOf(starts, lineNum, col)
    // A row whose text is not the file's (an aligned table) has no offset to start from.
    if (offset === null || whole.text[offset] !== bracket) return null
    const match = matchBracket(whole.text, offset, whole.skipped)
    if (match === null) return null
    const at = positionOf(starts, match)
    const shown = lineShowing(filename, side, at.lineNum)
    return shown && { line: shown.line, col: shown.exact ? at.col : 0 }
  }

  function inShownLines(filename: string, side: FileSide, from: number, col: number) {
    const mapping = deps.getMapping()
    const shown: number[] = []
    mapping.allLines.forEach((line, index) => {
      if (line.filename === filename && lineNumOn(line, side) !== undefined) shown.push(index)
    })
    const text = shown.map((line) => mapping.getLineContent(line)).join("\n")
    const starts = lineStarts(text)
    const offset = offsetOf(starts, shown.indexOf(from) + 1, col)
    const match = offset === null ? null : matchBracket(text, offset, [])
    deps.loadFileContent(filename)
    deps.toast(match === null ? SHOWN_LINES_MISS : SHOWN_LINES_NOTE)
    if (match === null) return null
    const at = positionOf(starts, match)
    return { line: shown[at.lineNum - 1]!, col: at.col }
  }

  return (row, col) => {
    const rows = rowsOf(deps.getSource())
    const from = rows.lineAt(row)
    const line = from === undefined ? undefined : deps.getMapping().getLine(from)
    if (from === undefined || !line?.filename) return null
    const side = rows.side(line)
    const lineNum = lineNumOn(line, side)
    const bracket = bracketFrom(line.content, col)
    if (lineNum === undefined || bracket === null) return null

    const whole = inWholeFile(line.filename, side, lineNum, bracket, line.content[bracket]!)
    const target = whole === undefined ? inShownLines(line.filename, side, from, bracket) : whole
    if (!target) return null
    const landed = rowsOf(deps.getSource()).rowAt(target.line)
    return landed === null ? null : { row: landed, col: target.col }
  }
}
