/**
 * The diff view's keys and the split toggle. The layer registers behind
 * every other one: a key any layer above takes or holds as a sequence never
 * reaches it, and a key they decline falls through to it. It binds a
 * pattern that matches every key rather than a list of names, because the
 * vim handler parses any key: counts, the character after f, F, t or T,
 * and keys it reads by name or by sequence.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { togglesSplit } from "../../app/split-toggle-key"
import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"

export interface DiffKeyDeps {
  getState: () => AppState
  getVimState: () => VimCursorState
  toggleSplitView: () => void
  /** handleInput on a context built for this key, false for a key it declines. */
  handle: (key: KeyEvent) => boolean
  chord: { chordPending(): boolean }
}

const ANY_KEY = "diff-key"

export function registerDiffKeys(riffKeymap: RiffKeymap, deps: DiffKeyDeps): () => void {
  const offPattern = riffKeymap.keymap.registerSequencePattern({
    name: ANY_KEY,
    display: "…",
    max: 1,
    match: () => ({ value: "…" }),
  })
  const offLayer = riffKeymap.keymap.registerLayer({
    // The split toggle answers with the tree focused too, so the layer is
    // enabled by the view alone and handleInput checks focus itself.
    enabled: () => !riffKeymap.held() && deps.getState().viewMode === "diff",
    commands: [
      {
        name: "diff.key",
        title: "Diff view",
        category: "Diff",
        palette: false,
        // Only the toggle gives way to a chord: a key that broke one off
        // reaches the diff at the re-offer, before the leftover is reached.
        run: ({ event }: { event: KeyEvent }) => {
          const state = deps.getState()
          if (togglesSplit(event, state.viewMode, deps.getVimState(), deps.chord.chordPending())) {
            deps.toggleSplitView()
            return true
          }
          return deps.handle(event)
        },
      },
    ],
    // handleInput prevents what it must itself, and a declined key must stay unprevented for the leftover.
    bindings: [{ key: `{${ANY_KEY}}`, cmd: "diff.key", preventDefault: false }],
  })
  return () => {
    offLayer()
    offPattern()
  }
}
