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
