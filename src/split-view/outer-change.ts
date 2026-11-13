import { theme } from "../theme"
import type { DiffLine } from "../vim-diff/types"

/**
 * A nested line's tint is the inner diff's, so what the review did to it
 * shows in the gutter instead (spec 116): its number in the change's colour,
 * and a bar in the cell after it.
 */
export function outerChangeFg(line: DiffLine | undefined): string | undefined {
  if (line?.outerChange === "addition") return theme.green
  if (line?.outerChange === "deletion") return theme.red
  return undefined
}

export const OUTER_CHANGE_BAR = "▌"

export function outerChangeBar(line: DiffLine | undefined): string {
  return line?.outerChange ? OUTER_CHANGE_BAR : " "
}
