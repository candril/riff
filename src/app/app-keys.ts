import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"

export interface AppKeyDeps {
  toggleConsole: () => void
}

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
    bindings: [{ key: "f12", cmd: "app.console" }],
  })
}
