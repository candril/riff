import type { LineAnchor } from "../marks/types"
import type { Jump } from "./types"

export function sameAnchor(a: LineAnchor, b: LineAnchor): boolean {
  return a.filename === b.filename && a.line === b.line && a.side === b.side
}

/**
 * The same row. Two anchors are compared by what they stand for, since the
 * mapping line under one may have moved since it was taken.
 */
function sameRow(a: Jump, b: Jump): boolean {
  if (a.anchor && b.anchor) return sameAnchor(a.anchor, b.anchor)
  return a.anchor === b.anchor && a.filename === b.filename && a.cursorLine === b.cursorLine
}

/** True when two captures are the same place. */
export function sameLocation(a: Jump, b: Jump): boolean {
  return (
    a.fileIndex === b.fileIndex &&
    a.filename === b.filename &&
    a.viewingCommit === b.viewingCommit &&
    a.viewMode === b.viewMode &&
    sameRow(a, b) &&
    a.cursorCol === b.cursorCol
  )
}

/**
 * True when two captures stand on the same line, whatever the column. This
 * is what keeps a line to one entry in the list, as nvim does; the view is
 * part of it because a line of the overview is not a line of the diff.
 * Anchored, the selected file is not: a line is the same line in one file
 * as among all of them.
 */
export function sameLine(a: Jump, b: Jump): boolean {
  return a.viewingCommit === b.viewingCommit && a.viewMode === b.viewMode && sameRow(a, b)
}
