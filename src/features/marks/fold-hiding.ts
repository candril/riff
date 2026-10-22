import type { AppState } from "../../state"
import { toggleBlockFold } from "../../state"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { resolveMark, type ResolvedMark } from "./resolve"
import type { LineAnchor } from "./types"

export interface FoldHidingContext {
  setState: (updater: (s: AppState) => AppState) => void
  getLineMapping: () => DiffLineMapping
  /** Builds the mapping again after a fold changed, and returns it. */
  rebuildLineMapping: () => DiffLineMapping
}

/**
 * A folded code block is one row standing where its lines were, so a mark
 * or a jumplist entry inside it can only land nearby. The fold that could
 * hide the line is the last one in its file that opens at or above it; it
 * is opened only if the line really is inside, so a place whose line is
 * simply gone leaves the reader's folds as they were.
 */
export function openFoldHiding(anchor: LineAnchor, first: ResolvedMark, ctx: FoldHidingContext): ResolvedMark {
  if (first.landing === "exact" || anchor.line === null) return first
  const foldId = foldAbove(ctx.getLineMapping(), anchor, anchor.line)
  if (!foldId) return first

  ctx.setState((s) => toggleBlockFold(s, foldId))
  const opened = resolveMark(ctx.rebuildLineMapping(), anchor)
  if (opened?.landing === "exact") return opened

  ctx.setState((s) => toggleBlockFold(s, foldId))
  ctx.rebuildLineMapping()
  return first
}

function foldAbove(mapping: DiffLineMapping, anchor: LineAnchor, line: number): string | null {
  let foldId: string | null = null
  for (const row of mapping.allLines) {
    if (row.filename !== anchor.filename || !row.blockFoldId) continue
    const fenceLine = anchor.side === "LEFT" ? row.oldLineNum : row.newLineNum
    if (fenceLine !== undefined && fenceLine <= line) foldId = row.blockFoldId
  }
  return foldId
}
