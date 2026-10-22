import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"

/**
 * Whatever the keymap's layers leave. `chordBroken`: the keymap held the
 * first key of a sequence and this key broke it off, so the leftover hands
 * it to the tree, whose layer stood aside for the chord.
 */
export type LeftoverKeys = (key: KeyEvent, chordBroken?: boolean) => void

/** `chordPending`: the jump recorder judges a chord as one interaction. */
export type KeyHandler = LeftoverKeys & { chordPending(): boolean }

/**
 * The keymap's layers first, the leftover for whatever they leave
 * (ADR-002). A sequence the keymap holds is a chord to the jump recorder.
 *
 * A key that misses a pending sequence only clears it: the keymap does not
 * dispatch that key from the root. The chat and the modals come ahead of
 * the sequences, so such a key goes round the layers once more with the
 * chord still pending, where every layer that gives way to a chord declines
 * it again, before the leftover reads it as a chord's second key.
 *
 * `settle` runs before any layer sees the key, and drops a chord the key
 * gives way to, such as a mark chord whose diff lost the keys to a click
 * into the tree: the key was typed for wherever the keys went, and reaches
 * every layer as a key with no chord pending.
 */
export function composeKeys(
  riffKeymap: Pick<RiffKeymap, "offer" | "reoffer" | "chordPending">,
  leftover: LeftoverKeys,
  settle?: (key: KeyEvent) => void,
): KeyHandler {
  const handle = (key: KeyEvent) => {
    settle?.(key)
    // Read before the offer, which clears the sequence the key breaks off.
    const sequencePending = riffKeymap.chordPending()
    if (riffKeymap.offer(key)) return
    if (sequencePending && riffKeymap.reoffer(key)) return
    leftover(key, sequencePending)
  }
  return Object.assign(handle, { chordPending: () => riffKeymap.chordPending() })
}
