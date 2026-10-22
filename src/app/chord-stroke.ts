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
 * are folded to lower case, so neither the shift nor the case of the
 * letter is left to the case of the name: terminals differ in whether
 * shift+a reports "a" or "A", the chain spelled the two `a!` and `A!`, and
 * each needs a pattern of its own.
 */
export function chordStrokeToken(suffix: string): string {
  const shifted = suffix.endsWith("!")
  const name = shifted ? suffix.slice(0, -1) : suffix
  const upper = name !== name.toLowerCase()
  return `chord-${shifted ? "shift-" : ""}${upper ? "upper-" : ""}${name.toLowerCase()}`
}

/**
 * The second strokes of every sequence in `layers`, each once: a suffix
 * two layers share is one sequence pattern, as the keymap refuses a
 * pattern name registered twice.
 */
export function sequenceSuffixes(...layers: readonly Readonly<Record<string, string>>[]): string[] {
  return [...new Set(layers.flatMap((sequences) => Object.keys(sequences).map((sequence) => sequence.slice(1))))]
}

/**
 * One sequence pattern per suffix, so a binding written `]{chord-f}` ends
 * on the key the chain would have read as `f`. The keymap compares every
 * modifier of a plain stroke, and the chain compared only the suffix.
 * A key `askedFirst` claims ends no sequence: the chain asked the chat
 * ahead of its chord matcher, so Ctrl-r after `]` reached the chat rather
 * than reading as `]r`. Such a key misses the sequence and goes round the
 * layers again (keys-dispatch.ts). Returns the unregister.
 */
export function registerChordStrokes(
  keymap: Keymap<Renderable, KeyEvent>,
  suffixes: readonly string[],
  askedFirst: (key: KeyEvent) => boolean = () => false,
): () => void {
  const offs = suffixes.map((suffix) =>
    keymap.registerSequencePattern({
      name: chordStrokeToken(suffix),
      display: suffix.replace(/!$/, ""),
      max: 1,
      match: (event: KeyEvent) =>
        chordSuffix(event) === suffix && !askedFirst(event) ? { value: suffix } : undefined,
    }),
  )
  return () => offs.forEach((off) => off())
}
