import type { ViewMode } from "../state"
import type { VimCursorState } from "../vim-diff/types"

/**
 * `\` toggles split in the diff view, except right after f, F, t or T,
 * where it is the character to find and belongs to the motion handler.
 */
export function togglesSplit(
  key: { name: string; ctrl?: boolean },
  viewMode: ViewMode,
  vimState: Pick<VimCursorState, "pendingFindChar">
): boolean {
  return viewMode === "diff" && !key.ctrl && key.name === "\\" && vimState.pendingFindChar === null
}
