/**
 * Flash mode input handling (spec 022).
 *
 * Flash captures every key while active: printable characters either
 * narrow the search or fire a label, and everything else is swallowed so
 * a stray motion can't run half-way through a jump.
 */

import type { KeyEvent } from "@opentui/core"
import type { FlashState } from "../../vim-diff/flash-state"
import type { FlashHandler } from "../../vim-diff/flash-handler"

export interface FlashInputContext {
  readonly flashState: FlashState
  readonly flashHandler: FlashHandler
}

/**
 * Handle input while flash mode is active.
 * Returns true if the key was consumed.
 */
export function handleInput(key: KeyEvent, ctx: FlashInputContext): boolean {
  if (!ctx.flashState.active) {
    return false
  }

  if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
    ctx.flashHandler.cancel()
    return true
  }

  if (key.name === "backspace") {
    ctx.flashHandler.handleBackspace()
    return true
  }

  if (key.name === "return" || key.name === "enter") {
    ctx.flashHandler.cancel()
    return true
  }

  if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
    ctx.flashHandler.handleChar(key.sequence)
  }

  return true
}
