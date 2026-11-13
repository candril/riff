/**
 * How a line is drawn, as against what it is in the file under review
 * (spec 116). The two differ only for a nested file's lines: `type` says
 * which version of the `.diff` a line is on, and anchors, numbers and the
 * file parses go by it; the inner diff says which half the line is drawn
 * in, how it is tinted and what its words are paired with.
 */

import type { DiffLine, DiffLineType } from "../vim-diff/types"

/** The type a line is laid out as: the half it sits in, and the run it pairs in. */
export function shownType(line: DiffLine): DiffLineType {
  switch (line.inner) {
    case undefined:
      return line.type
    case "addition":
    case "new-header":
      return "addition"
    case "deletion":
    case "old-header":
      return "deletion"
    default:
      return "context"
  }
}

/** The type a line is tinted as: a nested file's header pair sits in a half but is no change. */
export function tintType(line: DiffLine | undefined): DiffLineType | undefined {
  if (line?.inner === "old-header" || line?.inner === "new-header") return "context"
  return line && shownType(line)
}

/**
 * The type a line's words are paired as. In a modified nested file a line
 * the review changed pairs with the review's other side, as in any diff;
 * the rest pair across the inner diff.
 */
export function wordType(line: DiffLine | undefined): DiffLineType | undefined {
  if (!line) return undefined
  if (line.outerChange) return line.outerChange
  if (line.inner === "addition" || line.inner === "deletion") return line.inner
  return line.inner ? "context" : line.type
}

/** A nested line that is the inner diff's chrome, a header or an `@@`, rather than text. */
export function isInnerChrome(line: DiffLine | undefined): boolean {
  return line?.inner === "old-header" || line?.inner === "new-header" || line?.inner === "meta"
}
