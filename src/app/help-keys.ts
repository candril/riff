import type { KeyEvent } from "@opentui/core"
import { scrollHelp, toggleHelp, type AppState } from "../state"
import { helpViewport } from "../components/help-sections"

export interface HelpKeyContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** The terminal's rows, which decide how far the overlay's body scrolls. */
  height: number
}

/**
 * Keys while the help overlay is open: it is modal, so it takes every key
 * but `g`, which has to reach the chord matcher or `g?` couldn't close it.
 * Returns whether the key was taken.
 */
export function handleHelpKey(key: Pick<KeyEvent, "name" | "ctrl" | "shift">, ctx: HelpKeyContext): boolean {
  if (key.name === "escape" || key.name === "q") {
    ctx.setState(toggleHelp)
    ctx.render()
    return true
  }
  const { rows, maxScroll } = helpViewport(ctx.height)
  const half = Math.max(1, Math.floor(rows / 2))
  const delta =
    key.ctrl && key.name === "d" ? half
    : key.ctrl && key.name === "u" ? -half
    : key.ctrl ? 0
    : key.name === "j" || key.name === "down" ? 1
    : key.name === "k" || key.name === "up" ? -1
    : 0
  if (delta !== 0) {
    ctx.setState((s) => scrollHelp(s, delta, maxScroll))
    ctx.render()
    return true
  }
  return !(key.name === "g" && !key.ctrl && !key.shift)
}
