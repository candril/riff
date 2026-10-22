/**
 * The `z` chords as keymap sequences, registered with the bracket and `g`
 * layers behind the tree and ahead of the mark chords and the diff. Each
 * second stroke is a chord pattern (chord-stroke.ts), so it matches on the
 * chord suffix, whatever ctrl or meta is held. createAppKeys registers
 * those patterns, once for every sequence layer, and the timeout a lone
 * `z` gives up after (sequence-expiry.ts).
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"
import { chordStrokeToken, chordSuffix } from "./chord-stroke"
import { chordAllowedUnderPeek } from "./peek-leaves"
import { Z_PALETTE_KEYS, Z_SEQUENCES, zChordCommands, type ZChordDeps, type ZCommand } from "./z-chord-commands"

/**
 * The opener: a key named `z`, unshifted, with any other modifier. A
 * plain binding on `z` would not do: the keymap folds key names to lower
 * case, so it would also take a key named `Z` that reports no shift,
 * which belongs to the diff.
 */
const OPENER = "chord-opener-z"

const COMMANDS = [...new Set(Object.values(Z_SEQUENCES))]

export function registerZChordKeys(riffKeymap: RiffKeymap, deps: ZChordDeps): () => void {
  const commands = zChordCommands(deps)
  const offOpener = riffKeymap.keymap.registerSequencePattern({
    name: OPENER,
    display: "z",
    max: 1,
    match: (event: KeyEvent) => (event.name === "z" && !event.shift ? { value: "z" } : undefined),
  })
  const offLayer = riffKeymap.keymap.registerLayer({
    // Under a capture no sequence starts or continues: every modal outranks
    // the sequences.
    enabled: () => !riffKeymap.held(),
    commands: COMMANDS.map((cmd) => ({
      name: `zchord.${cmd}`,
      title: spellingsOf(cmd).join(" "),
      keys: Z_PALETTE_KEYS[cmd],
      category: "View",
      palette: false,
      run: ({ event }: { event: KeyEvent }) => {
        // A sequence a peek does not allow is swallowed, so it cannot reach the diff.
        if (!chordAllowedUnderPeek(`z${chordSuffix(event)}`, deps.getState().viewMode, deps.blamePeek.open(), deps.linePeek.open())) return true
        return commands[cmd]()
      },
    })),
    bindings: Object.entries(Z_SEQUENCES).map(([sequence, cmd]) => ({
      key: `{${OPENER}}{${chordStrokeToken(sequence.slice(1))}}`,
      cmd: `zchord.${cmd}`,
      preventDefault: false,
    })),
  })
  return () => {
    offLayer()
    offOpener()
  }
}

function spellingsOf(cmd: ZCommand): string[] {
  return Object.entries(Z_SEQUENCES)
    .filter(([, named]) => named === cmd)
    .map(([sequence]) => sequence)
}
