/**
 * Thread Preview input handling.
 *
 * The thread preview captures all input when open. Esc / Enter close it;
 * j/k move the focused comment so Ctrl+p → React… targets the right
 * entry (spec 042). Ctrl+p still falls through so the palette can open.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import { closeThreadPreview, moveThreadPreviewFocus } from "../../state"

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

  // Let Ctrl+P through so the action menu can still open over the preview.
  if (key.ctrl && key.name === "p") {
    return false
  }

  // Escape or Enter closes
  if (key.name === "escape" || key.name === "return" || key.name === "enter") {
    ctx.setState(closeThreadPreview)
    ctx.render()
    return true
  }

  // j/k (or arrow up/down) move the focused comment for reactions.
  if (key.name === "j" || key.name === "down") {
    ctx.setState(s => moveThreadPreviewFocus(s, 1))
    ctx.render()
    return true
  }
  if (key.name === "k" || key.name === "up") {
    ctx.setState(s => moveThreadPreviewFocus(s, -1))
    ctx.render()
    return true
  }

  // Capture all other keys when preview is open
  return true
}
