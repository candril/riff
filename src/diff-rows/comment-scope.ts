import { getSelectionRange } from "../vim-diff/cursor-state"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { CommentAnchor, VimCursorState } from "../vim-diff/types"
import type { SplitRows } from "./row-source"
import type { Side } from "./rows"

/**
 * The mapping lines a comment, or a link, is written on, in display order,
 * and the split pane they are read from. Unified has no pane.
 */
export interface CommentScope {
  lines: number[]
  pane?: Side
}

/**
 * What the cursor or the selection covers. In split view that is the rows
 * the selection spans, read in the active pane only: the mapping holds a
 * run of removals before its additions, so a span of mapping lines would
 * reach into the other pane, and a row whose active half is empty has no
 * line here at all.
 */
export function commentScope(state: VimCursorState, rows: SplitRows | null): CommentScope {
  if (!rows) {
    const [start, end] = getSelectionRange(state) ?? [state.line, state.line]
    return { lines: span(start, end) }
  }
  const rowOf = (line: number) => rows.rowAtLine(line) ?? line
  const anchor = getSelectionRange(state) ? state.selectionAnchor! : state.line
  const [start, end] = [rowOf(anchor), rowOf(state.line)].sort((a, b) => a - b) as [number, number]
  const lines: number[] = []
  for (let r = start; r <= end; r++) {
    const row = rows.rows[r]
    const line = row?.kind === "line" ? row.index : row?.[rows.side]
    if (line !== undefined) lines.push(line)
  }
  return { lines, pane: rows.side }
}

/** The anchor of every line in the scope that has one, in order. */
export function scopeAnchors(mapping: DiffLineMapping, scope: CommentScope): CommentAnchor[] {
  return scope.lines.flatMap((line) => mapping.getCommentAnchor(line, scope.pane) ?? [])
}

function span(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}
