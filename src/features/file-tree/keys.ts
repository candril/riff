/**
 * The file tree's keys. The layer registers behind the global keys, so
 * Escape clears a toast, Ctrl-l moves focus and Shift-c comments before
 * the tree sees them, and a key the global keys decline falls through to
 * the tree. It stands aside while a chord is pending, and a key that
 * breaks one off reaches the tree through treeLeftover.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import type { LeftoverKeys } from "../../app/keys-dispatch"
import { anyModifiers } from "../../app/key-variants"
import type { AppState } from "../../state"

export interface TreeKeyDeps {
  getState: () => AppState
  /** handleInput on a context built for this key, false for a key it does not name. */
  handle: (key: KeyEvent) => boolean
  chord: { chordPending(): boolean }
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
          if (deps.chord.chordPending()) return false
          return deps.handle(event)
        },
      },
    ],
    // handleInput prevents `/` itself, and a declined key must stay unprevented for whatever takes it next.
    bindings: KEYS.flatMap((key) => anyModifiers(key, "tree.key")).map((binding) => ({
      ...binding,
      preventDefault: false,
    })),
  })
}

/** What the keymap's layers leave, handed to the tree's handleInput, which checks focus itself. */
export function treeLeftover(deps: Pick<TreeKeyDeps, "handle">): LeftoverKeys {
  return (key, chordBroken = false) => {
    // A key that breaks off a chord without completing a sequence still goes
    // to the tree, whose layer stood aside for it while the chord was pending.
    // So does a slash the layer has no binding for: where `/` is a shifted key,
    // kitty names a modified slash after its base key ("7") and only its
    // sequence says "/", which the tree's filter opener matches.
    if (chordBroken || key.sequence === "/") deps.handle(key)
  }
}
