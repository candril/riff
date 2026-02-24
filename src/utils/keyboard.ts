// Re-export OpenTUI's KeyEvent type
import type { KeyEvent } from "@opentui/core"
export type { KeyEvent }

export type KeyHandler = (key: KeyEvent) => boolean | void

export interface KeyBinding {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  handler: () => void
}

/**
 * Simple key matcher for basic keybindings.
 * For sequence support (e.g., "g g"), use KeyMapper from config.
 */
export function matchKey(event: KeyEvent, binding: KeyBinding): boolean {
  if (event.name !== binding.key) return false
  if (binding.ctrl && !event.ctrl) return false
  if (binding.alt && !event.option) return false
  if (binding.shift && !event.shift) return false
  return true
}

/**
 * Create a keyboard handler from a list of bindings.
 */
export function createKeyHandler(bindings: KeyBinding[]): KeyHandler {
  return (event: KeyEvent) => {
    for (const binding of bindings) {
      if (matchKey(event, binding)) {
        binding.handler()
        return true
      }
    }
    return false
  }
}
