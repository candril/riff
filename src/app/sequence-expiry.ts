import type { RiffKeymap } from "./keymap"
import { chordTimeoutMs } from "../features/marks"

/**
 * A lone opener of one of `openers` gives up after its chordTimeoutMs,
 * as the chain's chords did: otherwise a stray `]` or `z`
 * would hold the next key however long it came, keeping the split toggle,
 * a find and every capture that stands aside for a chord from that key.
 * One listener serves every sequence layer, since each pending sequence
 * replaces the last and a listener per layer would disarm the other's
 * timer. Returns the unregister.
 */
export function expireSequenceOpeners(riffKeymap: RiffKeymap, openers: readonly string[]): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const disarm = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const off = riffKeymap.keymap.on("pendingSequence", (sequence) => {
    disarm()
    const opener = sequence[0]?.stroke.name
    if (opener === undefined || !openers.includes(opener)) return
    const timeout = chordTimeoutMs(opener)
    if (timeout !== null) timer = setTimeout(() => riffKeymap.keymap.clearPendingSequence(), timeout)
  })
  return () => {
    disarm()
    off()
  }
}
