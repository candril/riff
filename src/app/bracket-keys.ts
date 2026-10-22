/**
 * The `]`/`[` motions as keymap sequences. The layer registers with the `z`
 * and `g` layers behind the tree and ahead of the mark chords and the diff.
 * Each second stroke is a chord pattern (chord-stroke.ts), so it matches on
 * the chord suffix, whatever ctrl or meta is held, as the opener does
 * through anyModifiers. createAppKeys registers those patterns, once for
 * every sequence layer, and the timeout a lone opener gives up after
 * (sequence-expiry.ts).
 */

import type { RiffKeymap } from "./keymap"
import { anyModifiers } from "./key-variants"
import { chordStrokeToken, spelledChord } from "./chord-stroke"
import { chordAllowedUnderPeek } from "./peek-leaves"
import { BRACKET_SEQUENCES, bracketCommands, type BracketCommand, type BracketDeps } from "./bracket-commands"

const SEQUENCES = Object.entries(BRACKET_SEQUENCES).map(([sequence, cmd]) => ({
  opener: sequence[0]!,
  suffix: sequence.slice(1),
  cmd,
}))

/** Each command once, by its first spelling, which its hint shows. */
const COMMANDS = new Map<BracketCommand, string>()
for (const [sequence, cmd] of Object.entries(BRACKET_SEQUENCES)) if (!COMMANDS.has(cmd)) COMMANDS.set(cmd, sequence)

export function registerBracketKeys(riffKeymap: RiffKeymap, deps: BracketDeps): () => void {
  const commands = bracketCommands(deps)
  return riffKeymap.keymap.registerLayer({
    // Under a capture no sequence starts or continues: every modal outranks
    // the sequences.
    enabled: () => !riffKeymap.held(),
    commands: [...COMMANDS].map(([cmd, sequence]) => ({
      name: `bracket.${cmd}`,
      title: sequence,
      keys: spelledChord(sequence),
      category: "Motion",
      palette: false,
      run: () => {
        // A sequence a peek does not allow is swallowed, so it cannot reach the diff.
        if (!chordAllowedUnderPeek(sequence, deps.getState())) return true
        return commands[cmd]()
      },
    })),
    bindings: SEQUENCES.flatMap(({ opener, suffix, cmd }) =>
      anyModifiers(opener, `bracket.${cmd}`).map((binding) => ({
        key: `${binding.key}{${chordStrokeToken(suffix)}}`,
        cmd: binding.cmd,
        preventDefault: false,
      })),
    ),
  })
}
