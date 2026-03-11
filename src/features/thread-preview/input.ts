/**
 * Thread Preview input handling.
 *
 * The thread preview captures all input when open. Esc closes it.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import { closeThreadPreview } from "../../state"

export interface ThreadPreviewInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
}

/**
 * Handle input when thread preview is open.
 * Returns true if the key was handled (preview is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: ThreadPreviewInputContext
): boolean {
  if (!ctx.state.threadPreview.open) {
    return false
  }

  // Escape or Enter closes
  if (key.name === "escape" || key.name === "return" || key.name === "enter") {
    ctx.setState(closeThreadPreview)
    ctx.render()
    return true
  }

  // Capture all other keys when preview is open
  return true
}
