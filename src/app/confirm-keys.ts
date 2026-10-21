import type { AppState } from "../state"
import type { RiffKeymap } from "./keymap"

export interface ConfirmKeyDeps {
  getState: () => AppState
}

/**
 * A question waiting for an answer outranks every panel, and `y`/`n` mean
 * the answer while it is up — not "copy a link" and "new comment", which is
 * what the comments panel read them as. Every other key is ignored until
 * it is answered.
 */
export function registerConfirmKeys(riffKeymap: RiffKeymap, deps: ConfirmKeyDeps): () => void {
  const active = () => deps.getState().confirmDialog !== null
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: active,
    commands: [
      {
        name: "confirm.yes",
        title: "Confirm",
        category: "Dialog",
        palette: false,
        run: () => deps.getState().confirmDialog?.onConfirm(),
      },
      {
        name: "confirm.no",
        title: "Cancel",
        category: "Dialog",
        palette: false,
        run: () => deps.getState().confirmDialog?.onCancel(),
      },
    ],
    // The parser reports Y as y with shift, which a plain `y` does not match.
    bindings: [
      { key: "y", cmd: "confirm.yes" },
      { key: "shift+y", cmd: "confirm.yes" },
      { key: "n", cmd: "confirm.no" },
      { key: "shift+n", cmd: "confirm.no" },
      { key: "escape", cmd: "confirm.no" },
    ],
  })
  const unregisterCapture = riffKeymap.capture(active)
  return () => {
    unregisterCapture()
    unregisterLayer()
  }
}
