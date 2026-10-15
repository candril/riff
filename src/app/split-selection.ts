import type { SplitSelection } from "../split-view/overlays"
import { getCharSelection, getSelectionRange } from "../vim-diff/cursor-state"
import type { VimCursorState } from "../vim-diff/types"
import { toRowState, type SplitRows } from "./split-cursor"

/**
 * The selection as the split view draws it, ordered by rows rather than
 * mapping lines: a run of removals precedes its additions in the mapping,
 * so an anchor in one half and the cursor in the other would compare the
 * wrong way round.
 */
export function splitSelection(state: VimCursorState, source: SplitRows): SplitSelection | null {
  if (state.mode === "visual-line") {
    const range = getSelectionRange(toRowState(state, source))
    return range && { mode: "visual-line", startRow: range[0], startCol: 0, endRow: range[1], endCol: 0 }
  }
  if (state.mode !== "visual") return null
  const chars = getCharSelection(toRowState(state, source))
  return (
    chars && {
      mode: "visual",
      startRow: chars.startLine,
      startCol: chars.startCol,
      endRow: chars.endLine,
      endCol: chars.endCol,
    }
  )
}
