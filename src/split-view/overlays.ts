import type { FlashMatch } from "../vim-diff/flash-state"
import type { IncrementalSearchMatch } from "../vim-diff/search-state"
import type { DiffLine } from "../vim-diff/types"

/**
 * A visual selection over the split view's rows, in the active pane only.
 * `endCol` is inclusive, as vim's is; a linewise selection's columns are 0.
 */
export interface SplitSelection {
  mode: "visual" | "visual-line"
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

export interface SplitSearch {
  matches: readonly IncrementalSearchMatch[]
  /** Index into `matches`, or -1. */
  current: number
}

export interface SearchHit {
  startCol: number
  endCol: number
  current: boolean
}

// The rows unified's charwise selection skips, the same ones yank leaves out.
const SELECTION_SKIPPED_TYPES = new Set(["file-header", "hunk-header", "divider", "spacing", "no-newline"])

export function searchByLine(search: SplitSearch | null): ReadonlyMap<number, readonly SearchHit[]> {
  const byLine = new Map<number, SearchHit[]>()
  search?.matches.forEach((match, i) => {
    const hit = { startCol: match.startCol, endCol: match.endCol, current: i === search.current }
    const known = byLine.get(match.line)
    if (known) known.push(hit)
    else byLine.set(match.line, [hit])
  })
  return byLine
}

export function flashByLine(matches: readonly FlashMatch[] | null): ReadonlyMap<number, readonly FlashMatch[]> | null {
  if (!matches) return null
  const byLine = new Map<number, FlashMatch[]>()
  for (const match of matches) {
    const known = byLine.get(match.line)
    if (known) known.push(match)
    else byLine.set(match.line, [match])
  }
  return byLine
}

export function inLineSelection(selection: SplitSelection | null, row: number): boolean {
  return selection?.mode === "visual-line" && row >= selection.startRow && row <= selection.endRow
}

/** The columns of `line` a charwise selection covers on `row`, as renderSelectionOverlay works them out. */
export function charSelectionOn(
  selection: SplitSelection | null,
  row: number,
  line: DiffLine
): { from: number; to: number } | undefined {
  if (selection?.mode !== "visual" || row < selection.startRow || row > selection.endRow) return undefined
  if (SELECTION_SKIPPED_TYPES.has(line.type)) return undefined
  const from = row === selection.startRow ? selection.startCol : 0
  const to = row === selection.endRow ? selection.endCol + 1 : line.content.length
  return from < to ? { from, to } : undefined
}
