import type { Jump } from "./types"

/** True when two captures are the same place. */
export function sameLocation(a: Jump, b: Jump): boolean {
  return (
    a.fileIndex === b.fileIndex &&
    a.filename === b.filename &&
    a.viewingCommit === b.viewingCommit &&
    a.viewMode === b.viewMode &&
    a.cursorLine === b.cursorLine &&
    a.cursorCol === b.cursorCol
  )
}

/**
 * True when two captures stand on the same line, whatever the column. This
 * is what keeps a line to one entry in the list, as nvim does; the view is
 * part of it because a line of the overview is not a line of the diff.
 */
export function sameLine(a: Jump, b: Jump): boolean {
  return (
    a.filename === b.filename &&
    a.viewingCommit === b.viewingCommit &&
    a.viewMode === b.viewMode &&
    a.cursorLine === b.cursorLine
  )
}
