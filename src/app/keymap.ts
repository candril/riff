import type { CliRenderer, KeyEvent, Renderable } from "@opentui/core"
import { Keymap, type KeymapHost } from "@opentui/keymap"
import { registerDefaultKeys, registerEnabledFields, registerMetadataFields } from "@opentui/keymap/addons"
import { createOpenTuiKeymapHost } from "@opentui/keymap/opentui"

export interface RiffKeymap {
  keymap: Keymap<Renderable, KeyEvent>
  /** Feeds one keypress to the keymap; true when a binding took it or it continued a sequence. */
  offer(key: KeyEvent): boolean
  chordPending(): boolean
  /**
   * While `active`, every key no binding takes is kept from the chain and
   * handed to `rest`, for a modal that owns the keyboard. Returns the unregister.
   */
  capture(active: () => boolean, rest?: (key: KeyEvent) => void): () => void
}

interface Capture {
  active: () => boolean
  rest?: (key: KeyEvent) => void
}

/**
 * The keymap createDefaultOpenTuiKeymap would build, on a host riff feeds
 * itself (ADR-002). The stock host prepends its own listener on
 * `renderer.keyInput`, which would run every binding outside the jump
 * recorder and ahead of riff's single entry point for keys.
 */
export function createRiffKeymap(renderer: CliRenderer): RiffKeymap {
  const openTui = createOpenTuiKeymapHost(renderer)
  let feed: ((key: KeyEvent) => void) | null = null
  const host: KeymapHost<Renderable, KeyEvent> = {
    // Getters, not a spread: the OpenTUI host reads these live from the renderer.
    get metadata() {
      return openTui.metadata
    },
    get isDestroyed() {
      return openTui.isDestroyed
    },
    rootTarget: openTui.rootTarget,
    getFocusedTarget: () => openTui.getFocusedTarget(),
    getParentTarget: (target) => openTui.getParentTarget(target),
    isTargetDestroyed: (target) => openTui.isTargetDestroyed(target),
    onKeyPress(listener) {
      feed = listener
      return () => {
        if (feed === listener) feed = null
      }
    },
    onKeyRelease: (listener) => openTui.onKeyRelease(listener),
    onFocusChange: (listener) => openTui.onFocusChange(listener),
    onDestroy: (listener) => openTui.onDestroy!(listener),
    onTargetDestroy: (target, listener) => openTui.onTargetDestroy(target, listener),
    onRawInput: (listener) => openTui.onRawInput!(listener),
    createCommandEvent: () => openTui.createCommandEvent(),
  }

  const keymap = new Keymap(host)
  registerDefaultKeys(keymap)
  registerEnabledFields(keymap)
  registerMetadataFields(keymap)

  // The keymap's own verdict rather than defaultPrevented: a binding may
  // opt out of preventDefault and still have taken the key.
  let handled = false
  keymap.intercept("key:after", (ctx) => {
    handled = ctx.handled
  })
  const captures: Capture[] = []

  return {
    keymap,
    offer(key) {
      // Read before the key runs: a key that closes the modal (Esc in flash,
      // y on the dialog) arrived while it was up, and the chain must not see it.
      const capturing = captures.find((c) => c.active())
      handled = false
      feed?.(key)
      if (handled) return true
      if (!capturing) return false
      capturing.rest?.(key)
      return true
    },
    chordPending: () => keymap.hasPendingSequence(),
    capture(active, rest) {
      const capture: Capture = { active, rest }
      captures.push(capture)
      return () => {
        const at = captures.indexOf(capture)
        if (at >= 0) captures.splice(at, 1)
      }
    },
  }
}
