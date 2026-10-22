import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { rowText } from "./row-text"
import type { LineAnchor, Mark } from "./types"

export type MarkLanding = "exact" | "nearby" | "file"

export interface ResolvedMark {
  line: number
  /** The side the jump should make active in split. */
  side: Mark["side"]
  landing: MarkLanding
}

/**
 * The row a mark stands on in this mapping, or null when the file has no
 * row here at all (another file in single-file mode, outside the scope).
 *
 * Not refresh's `relocate`: it takes a row's side from its type, so a LEFT
 * mark on a context line could never match exactly.
 */
export function resolveMark(mapping: DiffLineMapping, mark: LineAnchor): ResolvedMark | null {
  const side = mark.side
  let firstRow = -1
  let nearest = -1
  let nearestDistance = Infinity

  const lines = mapping.allLines
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i]!
    if (row.filename !== mark.filename) continue
    if (firstRow === -1) firstRow = i
    if (mark.line === null) break

    const lineNum = side === "LEFT" ? row.oldLineNum : row.newLineNum
    if (lineNum === undefined) continue
    if (lineNum === mark.line) {
      // The number survived but the code on it did not, and following the
      // text could not find where it went.
      const same = mark.text === undefined || rowText(row) === mark.text
      return { line: i, side, landing: same ? "exact" : "nearby" }
    }

    // Strictly closer only, so the upper of two equally near rows stays.
    const distance = Math.abs(lineNum - mark.line)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = i
    }
  }

  if (firstRow === -1) return null
  if (mark.line === null) return { line: firstRow, side, landing: "exact" }
  if (nearest !== -1) return { line: nearest, side, landing: "nearby" }
  return { line: firstRow, side, landing: "file" }
}

/** What the status bar says after a jump; null when it landed where it was set. */
export function markLandingMessage(mark: Mark, landing: MarkLanding | null): string | null {
  const where = `Mark ${mark.letter}: `
  if (landing === null) return `${where}${mark.filename} is not in this diff`
  if (landing === "nearby") return `${where}line ${mark.line} of ${mark.filename} is gone — landed nearby`
  if (landing === "file") return `${where}${mark.filename} no longer shows line ${mark.line} — landed on the file`
  return null
}
