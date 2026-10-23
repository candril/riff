/**
 * Whether the chat column is open: the reader's Ctrl-r. The column is how
 * the reader lays out the screen, not review state, so the feature owns
 * the flag rather than AppState (spec 100, M6; ADR-003). It sits apart
 * from createChatState, which is the conversation and needs an agent. A
 * reload keeps the column open. A switch to another review (opening the
 * branch's PR, creating a PR) closes it, as rebuilding AppState always
 * did.
 */

import { createSignal } from "solid-js"

export type ChatColumnState = ReturnType<typeof createChatColumnState>

export function createChatColumnState() {
  const [open, setOpen] = createSignal(false)

  return {
    open,
    show() {
      setOpen(true)
    },
    hide() {
      setOpen(false)
    },
  }
}
