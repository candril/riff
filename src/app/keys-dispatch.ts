import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"

export type KeyHandler = ((key: KeyEvent) => void) & { chordPending(): boolean }

/**
 * The keymap's layers first, the legacy priority chain for whatever they
 * leave (ADR-002). Either one waiting for a second key is a chord to the
 * jump recorder.
 */
export function composeKeys(riffKeymap: Pick<RiffKeymap, "offer" | "chordPending">, legacy: KeyHandler): KeyHandler {
  const handle = (key: KeyEvent) => {
    if (!riffKeymap.offer(key)) legacy(key)
  }
  return Object.assign(handle, { chordPending: () => legacy.chordPending() || riffKeymap.chordPending() })
}
