import { promptOpen, type AppState, type PromptPickers } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { composerOpen } from "./diff-focus"

export interface InteractionInputs extends PromptPickers {
  state: AppState
  vim: Pick<VimCursorState, "pendingFindChar" | "pendingTextObject">
  searchActive: boolean
  flashActive: boolean
  chordPending: boolean
}

/**
 * Whether nothing is waiting for more keys. Until it is, the cursor may be
 * standing on a half-typed search's match or nowhere it will stay, and the
 * jumplist waits for the interaction to finish before judging where it led.
 */
export function interactionSettled(inputs: InteractionInputs): boolean {
  return !(
    promptOpen(inputs.state, inputs) ||
    composerOpen(inputs.state) ||
    inputs.searchActive ||
    inputs.flashActive ||
    inputs.chordPending ||
    inputs.vim.pendingFindChar !== null ||
    inputs.vim.pendingTextObject !== null
  )
}
