import { anchorSide, type DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffLine } from "../../vim-diff/types"
import type { Mark } from "./types"

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
  const row = mapping.getLine(visualIndex)
  if (!row?.filename) return null
  const filename = row.filename
  const fileMark: Mark = { letter, filename, line: null, side: "RIGHT" }
  if (row.type === "file-header") return fileMark

  // A divider or the spacing below a file has no line of its own, so the
  // nearest numbered row above it in the same file stands in for it.
  for (let i = visualIndex; i >= 0; i--) {
    const candidate = mapping.getLine(i)
    if (!candidate || candidate.filename !== filename) break
    const place = numberedPlace(candidate, pane)
    if (place) return { letter, filename, ...place }
  }

  return fileMark
}

function numberedPlace(row: DiffLine, pane: "left" | "right" | undefined): Pick<Mark, "line" | "side"> | null {
  if (row.type !== "context" && row.type !== "addition" && row.type !== "deletion") return null

  // A row in the pane it is not drawn in (an addition under the left pane)
  // still has its own side to be marked on.
  const side = anchorSide(row.type, pane) ?? (row.type === "deletion" ? "LEFT" : "RIGHT")
  const line = side === "LEFT" ? row.oldLineNum : row.newLineNum
  if (line !== undefined) return { line, side }

  // Expanded context near the top of a file can have no old number.
  if (row.newLineNum !== undefined) return { line: row.newLineNum, side: "RIGHT" }
  return null
}
