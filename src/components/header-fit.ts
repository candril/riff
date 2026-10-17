import { cellsOf } from "../diff-rows/cells"

/**
 * One child of a header row: a Text, or a run of Texts drawn without a gap
 * between them, as the `+a -d` counts are.
 */
export type HeaderChild = string[]

export const HEADER_PADDING = 2
export const HEADER_SEPARATION = 2
export const RIGHT_GAP = 2

/** What a row of children takes before Yoga shrinks or clips any of it. */
export function naturalCells(children: HeaderChild[], gap: number): number {
  if (children.length === 0) return 0
  const text = children.reduce((sum, child) => sum + child.reduce((cells, part) => cells + cellsOf(part), 0), 0)
  return text + gap * (children.length - 1)
}

/**
 * The version is the least important text in the header, so it is shown
 * only when everything else still fits whole beside it; a partial version
 * would name a build that does not exist.
 */
export function versionFits(width: number, { left, right }: { left: number; right: number }, versionCells: number): boolean {
  const rightWithVersion = right > 0 ? right + RIGHT_GAP + versionCells : versionCells
  return HEADER_PADDING + left + HEADER_SEPARATION + rightWithVersion <= width
}
