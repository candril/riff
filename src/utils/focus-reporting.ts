/**
 * Terminal focus reporting (DECSET mode 1004).
 *
 * Lets riff tell whether anyone is actually looking at it — a tmux pane
 * switched away, or a terminal window in the background, still runs every
 * timer riff has started. Background polling against a paid API quota is the
 * problem this solves.
 *
 * Supported by tmux, iTerm2, kitty, WezTerm, and most modern emulators. On a
 * terminal that ignores it, no focus events ever arrive, so callers must
 * treat "focused" as the default rather than waiting for a first event.
 */

import type { CliRenderer } from "@opentui/core"

export type FocusCallback = (focused: boolean) => void

const ENABLE_FOCUS_REPORTING = "\x1b[?1004h"
const DISABLE_FOCUS_REPORTING = "\x1b[?1004l"
const FOCUS_IN_SEQUENCE = "\x1b[I"
const FOCUS_OUT_SEQUENCE = "\x1b[O"

/**
 * Start reporting focus changes. Returns a cleanup function that turns
 * reporting back off — leaving mode 1004 enabled leaks `\x1b[I` / `\x1b[O`
 * into whatever shell owns the terminal after riff exits.
 */
export function setupFocusReporting(
  renderer: CliRenderer,
  onFocusChange: FocusCallback,
): () => void {
  process.stdout.write(ENABLE_FOCUS_REPORTING)

  const handleInput = (sequence: string): boolean => {
    if (sequence === FOCUS_IN_SEQUENCE) {
      onFocusChange(true)
      return true
    }
    if (sequence === FOCUS_OUT_SEQUENCE) {
      onFocusChange(false)
      return true
    }
    return false
  }

  // Prepended so the sequences are consumed before any key handler can
  // mistake them for a keypress.
  renderer.prependInputHandler(handleInput)

  return () => {
    renderer.removeInputHandler(handleInput)
    process.stdout.write(DISABLE_FOCUS_REPORTING)
  }
}
