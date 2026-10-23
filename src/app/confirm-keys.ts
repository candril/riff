import type { ConfirmState } from "../features/confirm/state"
import type { RiffKeymap } from "./keymap"
import { anyModifiers } from "./key-variants"

export interface ConfirmKeyDeps {
  confirm: Pick<ConfirmState, "dialog">
}

/** A dialog's second answer may sit on any of these; one binding each keeps the layer static. */
const ALTERNATIVE_KEYS = ["d"] as const

/**
 * A question waiting for an answer outranks every panel, and `y`/`n` mean
 * the answer while it is up — not "copy a link" and "new comment", which is
 * what the comments panel read them as. Every other key is ignored until
 * it is answered.
 */
export function registerConfirmKeys(riffKeymap: RiffKeymap, deps: ConfirmKeyDeps): () => void {
  const captured = riffKeymap.capture(() => deps.confirm.dialog() !== null)
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      {
        name: "confirm.yes",
        title: "Confirm",
        category: "Dialog",
        palette: false,
        run: () => deps.confirm.dialog()?.onConfirm(),
      },
      {
        name: "confirm.no",
        title: "Cancel",
        category: "Dialog",
        palette: false,
        run: () => deps.confirm.dialog()?.onCancel(),
      },
      ...ALTERNATIVE_KEYS.map((key) => ({
        name: `confirm.alternative.${key}`,
        title: "Confirm the other way",
        category: "Dialog",
        palette: false,
        run: () => {
          const alternative = deps.confirm.dialog()?.alternative
          if (alternative?.key === key) alternative.onConfirm()
        },
      })),
    ],
    bindings: [
      ...anyModifiers("y", "confirm.yes"),
      ...anyModifiers("n", "confirm.no"),
      ...anyModifiers("escape", "confirm.no"),
      ...ALTERNATIVE_KEYS.flatMap((key) => anyModifiers(key, `confirm.alternative.${key}`)),
    ],
  })
  return () => {
    captured()
    unregisterLayer()
  }
}
