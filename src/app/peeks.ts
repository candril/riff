import type { Comment } from "../types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import { getFiletypeFromPath } from "../vim-diff/filetype"
import { buildMermaidPeek } from "../features/diff-view/mermaid-peek"
import { buildTablePeek } from "../features/diff-view/table-peek"
import { commentHunk } from "../features/inline-comment-overlay/hunk"
import {
  diagramPeekModel,
  hunkPeekModel as peekOfHunk,
  linePeekModel,
  tablePeekModel,
  type PeekModel,
} from "../components/peek-model"

/** What gl shows for the cursor's line, or nothing when the line is not there. */
export function diffPeekModel(
  lineMapping: DiffLineMapping,
  cursorLine: number,
  peekSide: "new" | "old",
  peekScroll: { row: number; col: number },
  width: number,
  height: number
): PeekModel | null {
  const screen = { terminalWidth: width, terminalHeight: height }

  // A mermaid block is source for a picture; the peek draws the picture
  // (spec 058).
  const diagram = buildMermaidPeek(lineMapping, cursorLine, peekSide)
  if (diagram) {
    const { lines, source, kind, side, hasOther, note } = diagram
    return diagramPeekModel({ lines, source, kind, side, hasOther, note, scroll: peekScroll, ...screen })
  }

  // A table row on its own is the least readable line in the file; the peek
  // shows the table it belongs to instead.
  const table = buildTablePeek(lineMapping, cursorLine, Math.max(24, width - 8), peekSide)
  if (table) {
    const { lines, rowCount, side, hasOther } = table
    return tablePeekModel({ lines, rowCount, side, hasOther, scroll: peekScroll, ...screen })
  }

  const line = lineMapping.getLine(cursorLine)
  if (!line) return null
  return linePeekModel({
    // The file's own text: the padding an aligned table carries is there to
    // line up columns in the diff, and in a wrapped overlay it is only
    // whitespace.
    content: line.sourceContent ?? line.content,
    lineNumber: line.newLineNum ?? line.oldLineNum,
    filetype: line.filename ? getFiletypeFromPath(line.filename) : undefined,
    ...screen,
  })
}

/**
 * What c shows for a comment in the thread panel, or nothing when it has no
 * hunk. Drawn over the panel, not the diff: the comment is in the panel and
 * the code it was written against may be nowhere else (spec 060).
 */
export function hunkPeekModel(
  comments: readonly Comment[],
  codePeekId: string,
  width: number,
  height: number
): PeekModel | null {
  const hunk = commentHunk(comments, codePeekId)
  if (!hunk) return null
  const { hunk: text, filename, line, outdated, fromRoot } = hunk
  return peekOfHunk({ hunk: text, filename, line, outdated, fromRoot, terminalWidth: width, terminalHeight: height })
}
