import type { Side } from "../../diff-rows/rows"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { resolveMark } from "./resolve"
import { marksInOrder } from "./store"
import type { Mark } from "./types"

export interface MarkSign {
  letter: string
  side: Side
}

/**
 * The letters each row's gutter carries, keyed by the mapping's line, on
 * the row `'x` lands on, nearby and file landings included. A context row
 * is in both halves of split, so it can carry a letter for each side; two
 * marks on the same row and side show the first in letter order. A mark
 * whose file has no row here shows nowhere.
 */
export function markSigns(mapping: DiffLineMapping, marks: readonly Mark[]): ReadonlyMap<number, readonly MarkSign[]> {
  const signs = new Map<number, MarkSign[]>()
  for (const mark of marksInOrder({ marks })) {
    const resolved = resolveMark(mapping, mark)
    if (!resolved) continue
    const side: Side = resolved.side === "LEFT" ? "left" : "right"
    const row = signs.get(resolved.line) ?? []
    if (row.some((sign) => sign.side === side)) continue
    signs.set(resolved.line, [...row, { letter: mark.letter, side }])
  }
  return signs
}
