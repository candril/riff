/**
 * The blame peek's keys (spec 103): Esc or `q` closes it and `y` copies
 * the sha. The peek is modal, so every other key stops here and nothing
 * behind it moves while it is up, bar what peekLeaves hands on.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import type { BlameKeys } from "./keys"
import { peekLeaves, type PeekKeyContext } from "../../app/peek-leaves"

export interface BlamePeekKeyDeps extends PeekKeyContext {
  blame: Pick<BlameKeys, "close" | "copySha">
  /** Drops a pending mark chord of the chain's that `key` gives way to. */
  settleChainChord: (key: KeyEvent) => void
}

export function registerBlamePeekKeys(riffKeymap: RiffKeymap, deps: BlamePeekKeyDeps): () => void {
  const up = () => {
    const state = deps.getState()
    return state.blamePeek !== null && state.viewMode === "diff"
  }
  // Nothing is prevented: the chain never prevented the keys the peek took.
  const captured = riffKeymap.capture(
    (key) => up() && !peekLeaves(key, deps),
    (key) => deps.settleChainChord(key),
  )
  const command = (name: string, title: string, run: () => void) => ({
    name: `blamePeek.${name}`,
    title,
    category: "Blame",
    palette: false as const,
    run: ({ event }: { event: KeyEvent }) => {
      deps.settleChainChord(event)
      run()
    },
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
