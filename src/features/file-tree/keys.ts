/**
 * The file tree's keys. The layer registers behind the global keys, as the
 * chain asked those first: Escape clears a toast, Ctrl-l moves focus and
 * Shift-c comments before the tree sees them, and a key the global keys
 * decline falls through to the tree. It stands aside while the chain holds
 * a chord, because the chain resolves the sequence before the tree may see
 * the key.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
import type { AppState } from "../../state"

export interface TreeKeyDeps {
  getState: () => AppState
  /** handleInput on a context built for this key, false for a key it does not name. */
  handle: (key: KeyEvent) => boolean
  chain: { chordPendingAfter(key: KeyEvent): boolean; settleChord(key: KeyEvent): void }
}

const treeFocused = (state: AppState) => state.showFilePanel && state.focusedPanel === "tree"

/** The keypad's slash is named kpdivide and spelled "/", which handleInput reads as `/`. */
const KEYS = [
  "/",
  "kpdivide",
  "h",
  "ctrl+d",
  "ctrl+u",
  "j",
  "down",
  "k",
  "up",
  "return",
  "enter",
  "l",
  "right",
  "left",
  "escape",
  "v",
  "x",
]

export function registerTreeKeys(riffKeymap: RiffKeymap, deps: TreeKeyDeps): () => void {
  return riffKeymap.keymap.registerLayer({
    enabled: () => !riffKeymap.held() && treeFocused(deps.getState()),
    commands: [
      {
        name: "tree.key",
        title: "File tree",
        category: "File tree",
        palette: false,
        // handleInput matches names exactly, so a kitty capital such as "J",
        // which the keymap folds onto the `j` binding, is declined here.
        run: ({ event }: { event: KeyEvent }) => {
          if (deps.chain.chordPendingAfter(event)) return false
          deps.chain.settleChord(event)
          return deps.handle(event)
        },
      },
    ],
    // handleInput prevents `/` itself, and a declined key must stay unprevented for the chain.
    bindings: KEYS.flatMap((key) => anyModifiers(key, "tree.key")).map((binding) => ({
      ...binding,
      preventDefault: false,
    })),
  })
}
