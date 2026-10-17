import { isMarkLetter } from "./store"

type Key = { name?: string; shift?: boolean; ctrl?: boolean; meta?: boolean; sequence?: string }

export type MarkChord = "m" | "'"

export type MarkChordAction =
  | { kind: "set"; letter: string }
  | { kind: "jump"; letter: string }
  | { kind: "flip" }
  | { kind: "cancel" }

/**
 * The letter a key names after `m` or `'`. A terminal sends an uppercase
 * letter as itself, which OpenTUI reports as the lowercase name with shift
 * held; the sequence is the truer source, and the name only a fallback for
 * keys that arrive without one.
 */
export function markLetterOf(key: Key): string | null {
  const sequence = key.sequence ?? ""
  if (sequence.length === 1) return isMarkLetter(sequence) ? sequence : null
  const name = key.name ?? ""
  if (!isMarkLetter(name)) return null
  return key.shift ? name.toUpperCase() : name
}

export function isMarkQuote(key: Key): boolean {
  return key.sequence === "'" || key.name === "'"
}

/**
 * The chord a key opens, while the diff has the keys in normal mode. Marks
 * are places in the diff, so anywhere else `m` and `'` keep whatever they
 * already mean.
 */
export function markChordOpenedBy(key: Key, diffInNormalMode: boolean): MarkChord | null {
  if (!diffInNormalMode || key.ctrl || key.meta) return null
  if (key.name === "m" && !key.shift) return "m"
  if (isMarkQuote(key)) return "'"
  return null
}

/** What the key after the opener does. Anything but a letter, or `'` after `'`, cancels, as in vim. */
export function markChordAction(opener: MarkChord, key: Key): MarkChordAction {
  const letter = markLetterOf(key)
  if (letter) return opener === "m" ? { kind: "set", letter } : { kind: "jump", letter }
  if (opener === "'" && isMarkQuote(key)) return { kind: "flip" }
  return { kind: "cancel" }
}

/**
 * How long a chord opened by this key waits for its second key. Vim's `m`
 * and `'` wait as long as it takes: their second key is a letter that has a
 * binding of its own, so a slow chord that timed out would run that instead.
 */
export function chordTimeoutMs(opener: string): number | null {
  return opener === "m" || opener === "'" ? null : 500
}
