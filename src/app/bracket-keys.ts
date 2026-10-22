/**
 * The `]`/`[` motions as keymap sequences. The layer registers behind every
 * other one, the tree's included, because the chain asked its sequences
 * after the global keys and before the tree. Each second stroke is a chord
 * pattern (chord-stroke.ts), so it matches on the suffix the chain spelled,
 * whatever ctrl or meta is held, as the opener does through anyModifiers.
 * createAppKeys registers those patterns, once for every sequence layer,
 * and the timeout a lone opener gives up after (sequence-expiry.ts).
 */

import type { RiffKeymap } from "./keymap"
import { anyModifiers } from "./key-variants"
import { chordStrokeToken } from "./chord-stroke"
import { chordAllowedUnderPeek } from "./peek-leaves"
import { BRACKET_SEQUENCES, bracketCommands, type BracketDeps } from "./bracket-commands"

export interface BracketKeyDeps extends BracketDeps {
  /** The chain's own chord, not one the keymap holds: the layer is what holds that. */
  chain: { chordPending(): boolean }
}

const SEQUENCES = Object.entries(BRACKET_SEQUENCES).map(([sequence, cmd]) => ({
  opener: sequence[0]!,
  suffix: sequence.slice(1),
  sequence,
  cmd,
}))

export function registerBracketKeys(riffKeymap: RiffKeymap, deps: BracketKeyDeps): () => void {
  const commands = bracketCommands(deps)
  return riffKeymap.keymap.registerLayer({
    // Under a capture no sequence starts or continues, as every modal branch
    // came ahead of the chain's sequences; and while the chain holds `g`,
    // `m` or `'`, the key is its second.
    enabled: () => !riffKeymap.held() && !deps.chain.chordPending(),
    commands: SEQUENCES.map(({ sequence, cmd }) => ({
      name: `bracket.${cmd}`,
      title: sequence,
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
