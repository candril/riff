/**
 * The thread panel's code peek (spec 060): which comment's stored hunk is
 * up over the panel, if any. It is a sub-modal of the panel, not review
 * state, so the feature owns it rather than AppState (spec 100, M6;
 * ADR-003). Besides the reader's Esc, q and c, these paths close it:
 * closing or reopening the panel, a reload, a switch to another review,
 * and the frame pass once the panel is closed or the peeked comment is no
 * longer among those the panel shows. A peek left standing past any of
 * them would draw nothing yet keep holding the keys that close it.
 */

import { createSignal } from "solid-js"

export type CodePeekState = ReturnType<typeof createCodePeekState>

export function createCodePeekState() {
  const [id, setId] = createSignal<string | null>(null)

  return {
    id,
    open(commentId: string) {
      setId(commentId)
    },
    close() {
      if (id() !== null) setId(null)
    },
  }
}
