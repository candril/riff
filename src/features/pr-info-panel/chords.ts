/**
 * The PR overview's own `z` and `g` chords. They stay the panel's rather
 * than keymap sequences: the jump recorder reads the keymap's pending
 * sequence as a chord, which these never were, and every key that follows
 * one is still the panel's to act on or swallow.
 */

import type { KeyEvent } from "@opentui/core"
import * as act from "./actions"

const CHORD_TIMEOUT_MS = 500

export interface PanelChords {
  armZ(): void
  armG(): void
  pending(): boolean
  /**
   * Settles a pending chord: true when one was pending, in which case the
   * key is spent whether it completed the chord or not, so it cannot fall
   * into the panel's own `r`/`o`/`y`.
   */
  consume(key: KeyEvent): boolean
  dispose(): void
}

export function createPanelChords(deps: act.PRInfoPanelDeps): PanelChords {
  // One slot, as `z` and `g` each swallow the other. The timeout clears it
  // so a stray `z` or `g` is not read as half a chord across unrelated
  // keystrokes.
  let pendingKey: "z" | "g" | null = null
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  const drop = () => {
    pendingKey = null
    if (pendingTimeout) clearTimeout(pendingTimeout)
    pendingTimeout = null
  }
  const arm = (opener: "z" | "g") => {
    drop()
    pendingKey = opener
    pendingTimeout = setTimeout(drop, CHORD_TIMEOUT_MS)
  }

  const consumeZ = (key: KeyEvent) => {
    if (!deps.getPanel()) return
    // `zm`/`zr` mean `zM`/`zR`, as they do in the diff. nvim's `zO`/`zC`
    // recurse, which these folds do not, so they stay unbound rather than
    // pass for `zo`/`zc`.
    switch (key.name) {
      case "a":
        act.fold(deps, "za")
        return
      case "o":
        if (!key.shift) act.fold(deps, "zo")
        return
      case "c":
        if (!key.shift) act.fold(deps, "zc")
        return
      case "m":
      case "M":
        act.collapse(deps)
        return
      case "r":
      case "R":
        act.expand(deps)
        return
    }
  }

  const consumeG = (key: KeyEvent) => {
    // `?` reaches some terminals as a name and others only as the sequence.
    if (key.name === "?" || key.sequence === "?") {
      act.toggleHelp(deps)
      return
    }
    switch (key.name) {
      case "g":
        act.scrollTop(deps)
        return
      case "r":
        act.runAction(deps, "refresh")
        return
      case "o":
        act.runAction(deps, "open-in-browser")
        return
      case "y":
        act.runAction(deps, "copy-pr-url")
        return
      case "p":
        if (!key.shift) act.focusPreviews(deps)
        return
      // Terminals differ in whether shift+b reports its name as `B` or `b`.
      case "B":
        act.runAction(deps, "open-in-board")
        return
      case "b":
        if (key.shift) act.runAction(deps, "open-in-board")
        return
      case "x":
      case "X":
        // So the picker's prompt field, focused in this same keypress, does
        // not read the `x` as the first letter of a query.
        key.preventDefault()
        act.openLinks(deps, key.shift || key.name === "X" ? "copy" : "open")
        return
    }
  }

  return {
    armZ: () => arm("z"),
    armG: () => arm("g"),
    pending: () => pendingKey !== null,
    consume(key) {
      const opener = pendingKey
      if (!opener) return false
      drop()
      if (opener === "z") consumeZ(key)
      else consumeG(key)
      return true
    },
    dispose: drop,
  }
}
