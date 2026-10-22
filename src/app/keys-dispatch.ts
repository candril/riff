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
 *
 * A key that misses a pending sequence only clears it: the keymap does not
 * dispatch that key from the root. The chain asked the chat, then its
 * modals, ahead of its sequences, so such a key goes round the layers once
 * more with the chord still pending, where every layer that gives way to a
 * chord declines it again, before the chain reads it as a chord's second key.
 */
export function composeKeys(
  riffKeymap: Pick<RiffKeymap, "offer" | "reoffer" | "chordPending">,
  legacy: KeyHandler,
): KeyHandler {
  const handle = (key: KeyEvent) => {
    // Read before the offer, which clears the sequence the key breaks off.
    const sequencePending = riffKeymap.chordPending()
    if (riffKeymap.offer(key)) return
    if (sequencePending && riffKeymap.reoffer(key)) return
    legacy(key, sequencePending)
  }
  return Object.assign(handle, { chordPending: () => legacy.chordPending() || riffKeymap.chordPending() })
}
