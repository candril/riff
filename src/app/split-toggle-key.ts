import type { ViewMode } from "../state"
import type { VimCursorState } from "../vim-diff/types"

/**
 * `\` toggles split in the diff view, except right after f, F, t or T or a
 * prefix key such as g, z, [ or ], because there it belongs to that sequence.
 */
export function togglesSplit(
  key: { name: string; ctrl?: boolean },
  viewMode: ViewMode,
  vimState: Pick<VimCursorState, "pendingFindChar">,
  chordPending: boolean
): boolean {
  return (
    viewMode === "diff" &&
    !key.ctrl &&
    key.name === "\\" &&
    vimState.pendingFindChar === null &&
    !chordPending
  )
}
