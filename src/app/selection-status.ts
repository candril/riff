import { getSelectionRange, type SelectionState } from "../vim-diff/cursor-state"

export type SelectionStatus = { mode: "visual" | "visual-line"; lines: number } | null

/**
 * What the status bar says about a live selection, or nothing when there
 * isn't one.
 */
export function selectionStatus(vimState: SelectionState): SelectionStatus {
  const range = getSelectionRange(vimState)
  if (!range || vimState.mode === "normal") return null
  return { mode: vimState.mode, lines: range[1] - range[0] + 1 }
}
