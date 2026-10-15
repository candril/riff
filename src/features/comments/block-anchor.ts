import { scopeAnchors, type CommentScope } from "../../diff-rows/comment-scope"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { CommentAnchor } from "../../vim-diff/types"

export interface BlockAnchor {
  anchor: CommentAnchor
  /** The block's first line, when it is more than one. */
  blockStart?: number
  /** How the scope's last line reads, which a note is pinned to (spec 085). */
  anchorHash?: string
}

/**
 * Where the comments panel anchors for what the cursor or the selection
 * covers. A comment on a block is anchored to its last line and carries the
 * first, which is the shape GitHub's review API wants (spec 076). No anchor
 * means no line — a header, a divider, the gap between files.
 */
export function blockAnchor(mapping: DiffLineMapping, scope: CommentScope): BlockAnchor | null {
  const covered = scopeAnchors(mapping, scope)
  const first = covered[0]
  if (!first) return null
  // A selection that crosses files or sides is not a range GitHub can
  // take; the first line it covers is then the whole of it.
  const sameBlock = covered.filter(
    (candidate) => candidate.filename === first.filename && candidate.side === first.side
  )
  const last = sameBlock[sameBlock.length - 1]!
  return {
    anchor: { ...first, line: last.line },
    blockStart: first.line < last.line ? first.line : undefined,
    anchorHash: mapping.hashAt(scope.lines[scope.lines.length - 1]!),
  }
}
