/**
 * The tree's `/` prompt holds every key while it is open, or typing a path
 * would toggle the PR view on `i` and quit on `q`.
 *
 * Only the keys that mean something to riff are taken: Enter keeps the
 * filter and hands navigation back, Escape drops it. Everything else is left
 * to the focused `InputRenderable`, which is where Ctrl-w, word jumps,
 * paste, undo and selection come from.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
import { clearTreeFilter, commitTreeFilter, type AppState } from "../../state"

export interface TreeFilterKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  updatePanel: () => void
}

export function registerTreeFilterKeys(riffKeymap: RiffKeymap, deps: TreeFilterKeyDeps): () => void {
  const open = () => {
    const state = deps.getState()
    return state.showFilePanel && state.focusedPanel === "tree" && state.treeFilterInput
  }
  // No preventDefault in the rest: the input types every key not bound here.
  const captured = riffKeymap.capture(open)
  const command = (name: string, title: string, updater: (s: AppState) => AppState) => ({
    name: `treeFilter.${name}`,
    title,
    category: "File tree",
    palette: false as const,
    run: ({ event }: { event: KeyEvent }) => {
      event.preventDefault()
      deps.setState(updater)
      deps.updatePanel()
      deps.render()
    },
  })

  const unregisterPrompt = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      command("close", "Drop the filter", clearTreeFilter),
      command("commit", "Keep the filter", commitTreeFilter),
    ],
    bindings: [
      ...anyModifiers("escape", "treeFilter.close"),
      ...anyModifiers("return", "treeFilter.commit"),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, though both name Enter.
      ...anyModifiers("enter", "treeFilter.commit"),
    ],
  })
  // Backspace on an empty query closes the prompt the way it opened.
  const unregisterEmpty = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && deps.getState().treeFilter.length === 0,
    commands: [command("backOut", "Close the empty prompt", commitTreeFilter)],
    bindings: anyModifiers("backspace", "treeFilter.backOut"),
  })
  return () => {
    captured()
    unregisterPrompt()
    unregisterEmpty()
  }
}
