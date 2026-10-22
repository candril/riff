import type { KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"

type Stroke = Pick<KeyEvent, "name" | "sequence" | "shift">

/**
 * What a chord's second key adds to its opener in the priority chain: the
 * key's name, or a lone character the parser left unnamed, with "!" for
 * shift. Ctrl, meta, super and hyper are ignored, which is why `]` then
 * Ctrl-f still steps a file.
 */
export function chordSuffix(key: Stroke): string {
  const name = key.name || (key.sequence?.length === 1 ? key.sequence : "")
  return `${name}${key.shift ? "!" : ""}`
}

/**
 * The keymap token naming the second stroke that is `suffix`. Token names
 * are folded to lower case, so the shift is spelled out rather than left to
 * the case of the letter.
 */
export function chordStrokeToken(suffix: string): string {
  const shifted = suffix.endsWith("!")
  const name = shifted ? suffix.slice(0, -1) : suffix
  return `chord-${shifted ? "shift-" : ""}${name.toLowerCase()}`
}

/**
 * One sequence pattern per suffix, so a binding written `]{chord-f}` ends
 * on the key the chain would have read as `f`. The keymap compares every
 * modifier of a plain stroke, and the chain compared only the suffix.
 * Returns the unregister.
 */
export function registerChordStrokes(keymap: Keymap<Renderable, KeyEvent>, suffixes: readonly string[]): () => void {
  const offs = suffixes.map((suffix) =>
    keymap.registerSequencePattern({
      name: chordStrokeToken(suffix),
      display: suffix.replace(/!$/, ""),
      max: 1,
      match: (event: KeyEvent) => (chordSuffix(event) === suffix ? { value: suffix } : undefined),
    }),
  )
  return () => offs.forEach((off) => off())
}
