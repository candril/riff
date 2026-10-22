import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import { anyModifiers } from "./key-variants"

export interface AppKeyDeps {
  toggleConsole: () => void
}

/**
 * The layer's keys and their commands. appKeyTakes reads the same list, so
 * a key bound here is never swallowed as a pending chord's second key.
 */
export const APP_KEYS = { f12: "app.console" } as const

/**
 * The keys this layer takes. It ignores chords, so a sequence layer that
 * would otherwise swallow a second key leaves these to break off the
 * sequence and reach it at the re-offer.
 */
export const appKeyTakes = (key: Pick<KeyEvent, "name">): boolean => Object.hasOwn(APP_KEYS, key.name)

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
    bindings: Object.entries(APP_KEYS).flatMap(([name, cmd]) => anyModifiers(name, cmd)),
  })
}
