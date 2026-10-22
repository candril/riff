/**
 * The blame peek's keys (spec 103): Esc or `q` closes it and `y` copies
 * the sha. The peek is modal, so every other key stops here and nothing
 * behind it moves while it is up, bar what peekLeaves hands on.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import type { BlameKeys } from "./keys"
import type { BlamePeekState } from "./peek-state"
import { peekLeaves, type PeekKeyContext } from "../../app/peek-leaves"

export interface BlamePeekKeyDeps extends PeekKeyContext {
  blame: Pick<BlameKeys, "close" | "copySha">
  blamePeek: Pick<BlamePeekState, "peek">
}

export function registerBlamePeekKeys(riffKeymap: RiffKeymap, deps: BlamePeekKeyDeps): () => void {
  const up = () => {
    return deps.blamePeek.peek() !== null && deps.getState().viewMode === "diff"
  }
  // Nothing is prevented, the keys the peek takes included.
  const captured = riffKeymap.capture((key) => up() && !peekLeaves(key, deps))
  const command = (name: string, title: string, run: () => void) => ({
    name: `blamePeek.${name}`,
    title,
    category: "Blame",
    palette: false as const,
    run,
  })
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      command("close", "Close the blame peek", () => deps.blame.close()),
      command("copySha", "Copy the commit's sha", () => deps.blame.copySha()),
    ],
    bindings: [
      ...anyModifiers("escape", "blamePeek.close"),
      ...anyModifiers("q", "blamePeek.close"),
      ...without(["ctrl", "shift"], anyModifiers("y", "blamePeek.copySha")),
    ].map((binding) => ({ ...binding, preventDefault: false })),
  })
  return () => {
    captured()
    unregisterLayer()
  }
}
