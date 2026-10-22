/**
 * Help overlay keys: Esc or q closes, j/k and Ctrl-d/Ctrl-u scroll. The
 * overlay is modal, so it takes every key but `g`, which has to reach the
 * keymap's g sequences or `g?` couldn't close it.
 */

import type { RiffKeymap } from "./keymap"
import { anyModifiers, without } from "./key-variants"
import type { HelpState } from "../features/help/state"
import { helpViewport } from "../components/help-sections"

export interface HelpKeyDeps {
  help: HelpState
  render: () => void
  /** The terminal's rows, which decide how far the overlay's body scrolls. */
  height: () => number
  /** Whether a chord waits for its second key, which the help must not take. */
  chordPending: () => boolean
}

export function registerHelpKeys(riffKeymap: RiffKeymap, deps: HelpKeyDeps): () => void {
  const up = () => deps.help.open() && !deps.chordPending()
  const captured = riffKeymap.capture((key) => up() && !(key.name === "g" && !key.ctrl && !key.shift))
  const scroll = (delta: (half: number) => number) => () => {
    const { rows, maxScroll } = helpViewport(deps.height())
    const half = Math.max(1, Math.floor(rows / 2))
    deps.help.scrollBy(delta(half), maxScroll)
    deps.render()
  }
  const command = (name: string, title: string, run: () => void) => ({
    name: `help.${name}`,
    title,
    category: "Help",
    palette: false,
    run,
  })

  const unregisterLayer = riffKeymap.keymap.registerLayer({
    // Not `up` alone: a picker or Submit Review opened over the help by a
    // g-chord types the keys it leaves unbound, j and q among them.
    enabled: () => captured.holds(),
    commands: [
      command("close", "Close the help", () => {
        deps.help.toggle()
        deps.render()
      }),
      command("down", "Scroll the help down a row", scroll(() => 1)),
      command("up", "Scroll the help up a row", scroll(() => -1)),
      command("halfDown", "Scroll the help down half a window", scroll((half) => half)),
      command("halfUp", "Scroll the help up half a window", scroll((half) => -half)),
    ],
    bindings: [
      ...anyModifiers("escape", "help.close"),
      ...anyModifiers("q", "help.close"),
      ...anyModifiers("ctrl+d", "help.halfDown"),
      ...anyModifiers("ctrl+u", "help.halfUp"),
      // Under ctrl only d and u scroll; the capture swallows Ctrl-j and Ctrl-k.
      ...without(["ctrl"], anyModifiers("j", "help.down")),
      ...without(["ctrl"], anyModifiers("down", "help.down")),
      ...without(["ctrl"], anyModifiers("k", "help.up")),
      ...without(["ctrl"], anyModifiers("up", "help.up")),
    ],
  })
  return () => {
    captured()
    unregisterLayer()
  }
}
