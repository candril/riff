/**
 * The line peek's keys: Esc or `q` closes it, Tab swaps a drawn diagram
 * between the version the change arrives at and the one it replaces
 * (spec 058), and a drawing bigger than the window scrolls under the same
 * keys the diff does, half a page on Ctrl-d / Ctrl-u. The peek is modal, so
 * every other key stops here, bar what peekLeaves hands on.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import { scrollPeek, toggleLinePeek, togglePeekSide, type AppState } from "../../state"
import { peekLeaves, type PeekKeyContext } from "../../app/peek-leaves"

export interface LinePeekKeyDeps extends PeekKeyContext {
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** The terminal's rows, half of which Ctrl-d and Ctrl-u scroll. */
  height: () => number
}

const STEPS: [string, number, number][] = [
  ["j", 1, 0], ["down", 1, 0], ["k", -1, 0], ["up", -1, 0],
  ["l", 0, 4], ["right", 0, 4], ["h", 0, -4], ["left", 0, -4],
]

export function registerLinePeekKeys(riffKeymap: RiffKeymap, deps: LinePeekKeyDeps): () => void {
  // Nothing is prevented, the keys the peek takes included.
  const captured = riffKeymap.capture((key) => deps.getState().showLinePeek && !peekLeaves(key, deps))
  const update = (updater: (s: AppState) => AppState) => {
    deps.setState(updater)
    deps.render()
  }
  const half = () => Math.max(1, Math.floor(deps.height() / 2))
  const command = (name: string, title: string, run: () => void) => ({
    name: `linePeek.${name}`,
    title,
    category: "Peek",
    palette: false as const,
    run,
  })
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      command("close", "Close the peek", () => update(toggleLinePeek)),
      command("side", "Swap the side drawn", () => update(togglePeekSide)),
      command("halfDown", "Scroll down half a window", () => update((s) => scrollPeek(s, half(), 0))),
      command("halfUp", "Scroll up half a window", () => update((s) => scrollPeek(s, -half(), 0))),
      ...STEPS.map(([key, rows, cols]) =>
        command(`scroll.${key}`, "Scroll the peek", () => update((s) => scrollPeek(s, rows, cols))),
      ),
    ],
    bindings: [
      ...anyModifiers("escape", "linePeek.close"),
      ...anyModifiers("q", "linePeek.close"),
      ...anyModifiers("tab", "linePeek.side"),
      ...anyModifiers("ctrl+d", "linePeek.halfDown"),
      ...anyModifiers("ctrl+u", "linePeek.halfUp"),
      ...STEPS.flatMap(([key]) => without(["ctrl"], anyModifiers(key, `linePeek.scroll.${key}`))),
    ].map((binding) => ({ ...binding, preventDefault: false })),
  })
  return () => {
    captured()
    unregisterLayer()
  }
}
