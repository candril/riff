import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"

/**
 * Whether the diff reads `m`, `'` and `]m` as mark keys. `fm` finds an m and
 * `vi'` selects quotes: a key some motion is waiting for is not a chord.
 */
export function diffTakesMarkChord(ctx: { getState: () => AppState; getVimState: () => VimCursorState }): boolean {
  const state = ctx.getState()
  const vim = ctx.getVimState()
  return (
    state.viewMode === "diff" &&
    state.focusedPanel === "diff" &&
    vim.mode === "normal" &&
    vim.pendingFindChar === null &&
    vim.pendingTextObject === null
  )
}
