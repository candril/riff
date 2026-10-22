/**
 * The thread panel's own `za` and `g` chords. They stay the panel's rather
 * than keymap sequences: the jump recorder reads the keymap's pending
 * sequence as a chord, which these never were, and a key that breaks one
 * off is still the panel's to act on or swallow.
 */

import type { KeyEvent } from "@opentui/core"
import {
  highlightedComment,
  highlightEntry,
  openLinks,
  toggleHelp,
  toggleHighlightedThread,
  type ThreadPanelViewDeps,
} from "./view-actions"

const CHORD_TIMEOUT_MS = 500

export interface PanelChords {
  armZ(): void
  armG(): void
  gPending(): boolean
  /** Breaks off a pending `z`; a key that did so falls through to its own meaning. */
  dropZ(): void
  /** Settles a pending `z`: true when the key completed `za` and is spent. */
  consumeZ(key: KeyEvent): boolean
  /** Settles both chords in the order the panel always has: true when the key is spent. */
  consume(key: KeyEvent): boolean
  dispose(): void
}

export function createPanelChords(deps: ThreadPanelViewDeps): PanelChords {
  // A timeout clears each so a stray `z` or `g` is not read as half a
  // chord across unrelated keystrokes.
  let zTimeout: ReturnType<typeof setTimeout> | null = null
  let gTimeout: ReturnType<typeof setTimeout> | null = null

  const dropZ = () => {
    if (zTimeout) clearTimeout(zTimeout)
    zTimeout = null
  }
  const dropG = () => {
    if (gTimeout) clearTimeout(gTimeout)
    gTimeout = null
  }

  const consumeZ = (key: KeyEvent) => {
    if (!zTimeout) return false
    dropZ()
    if (key.name === "a" && !key.ctrl && !key.shift) {
      toggleHighlightedThread(deps)
      return true
    }
    return false
  }

  // Every other g-sequence is swallowed rather than falling through into
  // the panel's own `r`/`e`/`d`.
  const consumeG = (key: KeyEvent) => {
    if (!gTimeout) return false
    dropG()
    if (key.name === "?" || key.sequence === "?") {
      toggleHelp(deps)
      return true
    }
    if (key.name === "g" && !key.shift && !key.ctrl) {
      highlightEntry(deps, 0)
      return true
    }
    const highlighted = highlightedComment(deps.getState())
    if ((key.name === "x" || key.name === "X") && highlighted) {
      // So the picker's prompt field, focused in this same keypress, does
      // not read the `x` as the start of a query.
      key.preventDefault()
      openLinks(deps, highlighted, key.shift || key.name === "X" ? "copy" : "open")
    }
    return true
  }

  return {
    armZ() {
      dropZ()
      zTimeout = setTimeout(dropZ, CHORD_TIMEOUT_MS)
    },
    armG() {
      dropG()
      gTimeout = setTimeout(dropG, CHORD_TIMEOUT_MS)
    },
    gPending: () => gTimeout !== null,
    dropZ,
    consumeZ,
    consume: (key) => consumeZ(key) || consumeG(key),
    dispose() {
      dropZ()
      dropG()
    },
  }
}
