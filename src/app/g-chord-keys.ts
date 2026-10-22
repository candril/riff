/**
 * The `g` chords as keymap sequences, registered with the bracket and `z`
 * layers behind every other one, because the chain asked its sequences
 * after the global keys and before the tree. Each second stroke is a chord
 * pattern (chord-stroke.ts), so it matches on the suffix the chain spelled,
 * whatever ctrl or meta is held. createAppKeys registers those patterns,
 * once for every sequence layer, and the timeout a lone `g` gives up after
 * (sequence-expiry.ts).
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"
import { chordStrokeToken, chordSuffix } from "./chord-stroke"
import { chordAllowedUnderPeek } from "./peek-leaves"
import { G_SEQUENCES, gChordCommands, type GChordDeps, type GCommand } from "./g-chord-commands"

export interface GChordKeyDeps extends GChordDeps {
  /** A key that ends no sequence, as the chain asked the chat about it first. */
  askedFirst: (key: KeyEvent) => boolean
  /** A key a layer that ignores chords takes, such as F12, which a lone `g` leaves to it. */
  ignoresChords: (key: KeyEvent) => boolean
}

/**
 * The opener as the chain opened on it: a key named `g`, unshifted, with
 * any other modifier. A plain binding on `g` would not do: the keymap folds
 * key names to lower case, so it would also take a key named `G` that
 * reports no shift, which belongs to the diff's motion handler.
 */
const OPENER = "chord-opener-g"

/**
 * Any second key a peek does not allow. The peeks leave a bare `g` so their
 * own chords can complete, and the chain swallowed every other sequence
 * under them, `gj` included, rather than let its second key reach the diff
 * once the sequence broke off. A key the chat or a layer that ignores
 * chords takes is left to break off the sequence and reach it at the
 * re-offer, as those were asked ahead of the chain's sequences.
 */
const UNDER_PEEK = "chord-g-under-peek"

const COMMANDS = [...new Set(Object.values(G_SEQUENCES))]

export function registerGChordKeys(riffKeymap: RiffKeymap, deps: GChordKeyDeps): () => void {
  const commands = gChordCommands(deps)
  const refusedUnderPeek = (event: KeyEvent) =>
    !chordAllowedUnderPeek(`g${chordSuffix(event)}`, deps.getState())
  const offOpener = riffKeymap.keymap.registerSequencePattern({
    name: OPENER,
    display: "g",
    max: 1,
    match: (event: KeyEvent) => (event.name === "g" && !event.shift ? { value: "g" } : undefined),
  })
  const offUnderPeek = riffKeymap.keymap.registerSequencePattern({
    name: UNDER_PEEK,
    display: "…",
    max: 1,
    match: (event: KeyEvent) =>
      refusedUnderPeek(event) && !deps.askedFirst(event) && !deps.ignoresChords(event)
        ? { value: chordSuffix(event) }
        : undefined,
  })
  const offLayer = riffKeymap.keymap.registerLayer({
    // Under a capture no sequence starts or continues, as every modal branch
    // came ahead of the chain's sequences.
    enabled: () => !riffKeymap.held(),
    commands: [
      ...COMMANDS.map((cmd) => ({
        name: `gchord.${cmd}`,
        title: spellingsOf(cmd).join(" "),
        category: "Go",
        palette: false,
        run: ({ event }: { event: KeyEvent }) => {
          // A sequence a peek does not allow is swallowed, so it cannot reach the diff.
          if (refusedUnderPeek(event)) return true
          return commands[cmd](event)
        },
      })),
      { name: "gchord.underPeek", title: "g under a peek", category: "Go", palette: false, run: () => true },
    ],
    bindings: [
      ...Object.entries(G_SEQUENCES).map(([sequence, cmd]) => ({
        key: `{${OPENER}}{${chordStrokeToken(sequence.slice(1))}}`,
        cmd: `gchord.${cmd}`,
        preventDefault: false,
      })),
      { key: `{${OPENER}}{${UNDER_PEEK}}`, cmd: "gchord.underPeek", preventDefault: false },
    ],
  })
  return () => {
    offLayer()
    offUnderPeek()
    offOpener()
  }
}

function spellingsOf(cmd: GCommand): string[] {
  return Object.entries(G_SEQUENCES)
    .filter(([, named]) => named === cmd)
    .map(([sequence]) => sequence)
}
