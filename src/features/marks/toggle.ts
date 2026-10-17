import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { resolveMark } from "./resolve"
import type { Mark } from "./types"

/**
 * Whether `m{letter}` at the cursor would land `mark` where it already is,
 * so the press removes it instead of setting it.
 *
 * Only an exact landing counts: on a nearby or file landing the letter
 * stands in for a line that is gone, and pressing m there re-anchors the
 * mark on the code the reader is looking at rather than throwing it away.
 */
export function markSitsAt(mapping: DiffLineMapping, mark: Mark, cursorLine: number, placed: Mark, split: boolean): boolean {
  const resolved = resolveMark(mapping, mark)
  if (resolved?.landing !== "exact" || resolved.line !== cursorLine) return false
  // A context row is drawn in both of split's panes, each with its own
  // letter cell, so the mark sits only in its own side's pane. Unified's
  // single cell shows it whatever its side.
  return !split || mark.side === placed.side
}
