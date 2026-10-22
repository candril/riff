import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"

/**
 * `chordBroken`: the keymap held the first key of a sequence and this key
 * broke it off, so the chain reads it as the second key of a chord.
 */
export type KeyHandler = ((key: KeyEvent, chordBroken?: boolean) => void) & { chordPending(): boolean }

/**
 * The keymap's layers first, the legacy priority chain for whatever they
 * leave (ADR-002). Either one waiting for a second key is a chord to the
 * jump recorder.
 */
export function composeKeys(riffKeymap: Pick<RiffKeymap, "offer" | "chordPending">, legacy: KeyHandler): KeyHandler {
  const handle = (key: KeyEvent) => {
    // Read before the offer, which clears the sequence the key breaks off.
    const sequencePending = riffKeymap.chordPending()
    if (!riffKeymap.offer(key)) legacy(key, sequencePending)
  }
  return Object.assign(handle, { chordPending: () => legacy.chordPending() || riffKeymap.chordPending() })
}
