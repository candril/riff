import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import { anyModifiers } from "./key-variants"

export interface AppKeyDeps {
  toggleConsole: () => void
}

/**
 * The keys this layer takes. It ignores chords, so a sequence layer that
 * would otherwise swallow a second key leaves these to break off the
 * sequence and reach it at the re-offer.
 */
export const appKeyTakes = (key: KeyEvent): boolean => key.name === "f12"

/** Keys that hold wherever focus is, so the layer has no target. */
export function registerAppKeys(keymap: Keymap<Renderable, KeyEvent>, deps: AppKeyDeps): () => void {
  return keymap.registerLayer({
    commands: [
      {
        name: "app.console",
        title: "Toggle the debug console",
        category: "Debug",
        palette: false,
        run: () => deps.toggleConsole(),
      },
    ],
    bindings: anyModifiers("f12", "app.console"),
  })
}
