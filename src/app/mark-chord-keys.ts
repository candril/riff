/**
 * The mark chords (spec 101) as keymap sequences: `m{letter}` sets a mark,
 * `'{letter}` jumps to one and `''` flips back. The layer registers behind
 * every other one, the bracket, `z` and `g` layers included, because the
 * chain asked its mark chords after everything else that is now a layer.
 * A mark chord waits as long as it takes (chordTimeoutMs), so its openers
 * are not among the ones sequence-expiry.ts gives up on.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"
import {
  flipMark,
  isMarkQuote,
  jumpToMark,
  markChordOpenedBy,
  markLetterOf,
  pendingMarkChordGivesWay,
  setMarkAtCursor,
  type MarkChord,
  type MarksContext,
} from "../features/marks"

export interface MarkChordKeyDeps {
  marksContext: MarksContext
  /** Whether the diff has the keys in normal mode, with no find or text object waiting (mark-chord-gate.ts). */
  diffTakesMarkChord: () => boolean
  /** A key that ends no chord, as the chain asked the chat about it first. */
  askedFirst: (key: KeyEvent) => boolean
  /** A key a layer that ignores chords takes, such as F12, which a pending chord leaves to it. */
  ignoresChords: (key: KeyEvent) => boolean
}

export interface MarkChordKeys {
  /**
   * Drops a pending mark chord that `key` gives way to, before any layer
   * sees the key: once the diff has lost the keys, say to a click into the
   * tree, the key was typed for wherever they went. composeKeys runs it at
   * the dispatch entry.
   */
  settle(key: KeyEvent): void
  unregister(): void
}

/**
 * Pattern names of their own: chord-stroke.ts names its second strokes
 * `chord-…`, and the keymap refuses a name registered twice.
 */
const OPENERS: Record<MarkChord, string> = { m: "chord-opener-m", "'": "chord-opener-quote" }
const LETTER = "mark-chord-letter"
const QUOTE = "mark-chord-quote"
/** Any other second key, which the chord swallows, as in vim. */
const OTHER = "mark-chord-other"

export function registerMarkChordKeys(riffKeymap: RiffKeymap, deps: MarkChordKeyDeps): MarkChordKeys {
  const { keymap } = riffKeymap
  // A key the chat or a layer that ignores chords takes breaks off the
  // chord and acts at the re-offer, as the chain asked those ahead of it.
  const reachesPast = (event: KeyEvent) => deps.askedFirst(event) || deps.ignoresChords(event)
  const offs = [
    ...(Object.entries(OPENERS) as [MarkChord, string][]).map(([opener, name]) =>
      keymap.registerSequencePattern({
        name,
        display: opener,
        max: 1,
        // A key that broke off another sequence (the `'` of `]'`) is that
        // chord's second key, and never opened a mark chord.
        match: (event: KeyEvent) =>
          !riffKeymap.reoffering() && markChordOpenedBy(event, deps.diffTakesMarkChord()) === opener
            ? { value: opener }
            : undefined,
      }),
    ),
    keymap.registerSequencePattern({
      name: LETTER,
      display: "{letter}",
      max: 1,
      match: (event: KeyEvent) => {
        const letter = markLetterOf(event)
        return letter && !reachesPast(event) ? { value: letter } : undefined
      },
    }),
    keymap.registerSequencePattern({
      name: QUOTE,
      display: "'",
      max: 1,
      match: (event: KeyEvent) => (isMarkQuote(event) && !reachesPast(event) ? { value: "'" } : undefined),
    }),
    keymap.registerSequencePattern({
      name: OTHER,
      display: "…",
      max: 1,
      match: (event: KeyEvent) =>
        !markLetterOf(event) && !isMarkQuote(event) && !reachesPast(event) ? { value: "…" } : undefined,
    }),
  ]
  const letterOf = (event: KeyEvent) => markLetterOf(event)!
  const command = (name: string, title: string, run: (event: KeyEvent) => void) => ({
    name: `markchord.${name}`,
    title,
    category: "Marks",
    palette: false,
    run: ({ event }: { event: KeyEvent }) => run(event),
  })
  const offLayer = keymap.registerLayer({
    // Under a capture no chord starts or continues, as every modal branch
    // came ahead of the chain's chords.
    enabled: () => !riffKeymap.held(),
    commands: [
      command("set", "Set a mark", (event) => setMarkAtCursor(letterOf(event), deps.marksContext)),
      command("jump", "Jump to a mark", (event) => void jumpToMark(letterOf(event), deps.marksContext)),
      command("flip", "Back to the mark before", () => void flipMark(deps.marksContext)),
      command("swallow", "Drop the mark chord", () => {}),
    ],
    // Nothing is prevented: the chain never prevented the keys of its chords.
    bindings: [
      { key: `{${OPENERS.m}}{${LETTER}}`, cmd: "markchord.set" },
      { key: `{${OPENERS.m}}{${QUOTE}}`, cmd: "markchord.swallow" },
      { key: `{${OPENERS.m}}{${OTHER}}`, cmd: "markchord.swallow" },
      { key: `{${OPENERS["'"]}}{${LETTER}}`, cmd: "markchord.jump" },
      { key: `{${OPENERS["'"]}}{${QUOTE}}`, cmd: "markchord.flip" },
      { key: `{${OPENERS["'"]}}{${OTHER}}`, cmd: "markchord.swallow" },
    ].map((binding) => ({ ...binding, preventDefault: false })),
  })
  // The pending part carries neither the pattern's name nor the key's
  // sequence, so its stroke cannot tell a `'` typed as a shifted key (German
  // Shift-#) apart from `#`; the opener pattern's display names it either way.
  const pendingOpener = (): MarkChord | null => {
    const pending = keymap.getPendingSequence()
    const display = pending.length === 1 ? pending[0]!.display : undefined
    return display === "m" || display === "'" ? display : null
  }
  return {
    settle(key) {
      if (pendingMarkChordGivesWay(pendingOpener(), key, deps.diffTakesMarkChord())) keymap.clearPendingSequence()
    },
    unregister() {
      offLayer()
      offs.forEach((off) => off())
    },
  }
}
