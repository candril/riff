import { anchorSide, type DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffLine } from "../../vim-diff/types"
import { rowText } from "./row-text"
import type { LineAnchor, Mark } from "./types"

/**
 * The place a row stands for, as a mark keeps it: a file, a line and a
 * side, which folds, wrap, split and a refresh all leave where they were.
 * Null on a row outside any file.
 */
export function anchorAt(
  mapping: Pick<DiffLineMapping, "getLine">,
  visualIndex: number,
  pane?: "left" | "right"
): LineAnchor | null {
  const row = mapping.getLine(visualIndex)
  if (!row?.filename) return null
  const filename = row.filename
  const fileAnchor: LineAnchor = { filename, line: null, side: "RIGHT" }
  if (row.type === "file-header") return fileAnchor

  // A divider or the spacing below a file has no line of its own, so the
  // nearest numbered row above it in the same file stands in for it.
  for (let i = visualIndex; i >= 0; i--) {
    const candidate = mapping.getLine(i)
    if (!candidate || candidate.filename !== filename) break
    const place = numberedPlace(candidate, pane)
    if (place) return { filename, ...place }
  }

  return fileAnchor
}

/**
 * The mark `m{letter}` sets on a row. It is not a comment anchor: an
 * expanded-context line or a file in file mode is a place worth returning
 * to even though GitHub could not take a comment there.
 */
export function markAt(
  mapping: DiffLineMapping,
  visualIndex: number,
  letter: string,
  pane?: "left" | "right"
): Mark | null {
  const anchor = anchorAt(mapping, visualIndex, pane)
  return anchor ? { letter, ...anchor } : null
}

function numberedPlace(row: DiffLine, pane: "left" | "right" | undefined): Omit<LineAnchor, "filename"> | null {
  if (row.type !== "context" && row.type !== "addition" && row.type !== "deletion") return null

  // A row in the pane it is not drawn in (an addition under the left pane)
  // still has its own side to be marked on.
  const side = anchorSide(row.type, pane) ?? (row.type === "deletion" ? "LEFT" : "RIGHT")
  const line = side === "LEFT" ? row.oldLineNum : row.newLineNum
  // Text is what a later patch is searched for, and the patch never carries
  // expanded context: such a mark could only ever be found again on some
  // other hunk line that happens to read the same, a brace or a blank line.
  // Without text it keeps its number.
  const text = row.expanded ? {} : { text: rowText(row) }
  if (line !== undefined) return { line, side, ...text }

  // Expanded context near the top of a file can have no old number.
  if (row.newLineNum !== undefined) return { line: row.newLineNum, side: "RIGHT", ...text }
  return null
}
