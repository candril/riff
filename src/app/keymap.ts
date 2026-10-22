import type { CliRenderer, KeyEvent, Renderable } from "@opentui/core"
import { Keymap, type KeymapHost } from "@opentui/keymap"
import { registerDefaultKeys, registerEnabledFields, registerMetadataFields } from "@opentui/keymap/addons"
import { createOpenTuiKeymapHost } from "@opentui/keymap/opentui"

export interface RiffKeymap {
  keymap: Keymap<Renderable, KeyEvent>
  /** Feeds one keypress to the keymap; true when a binding took it or it continued a sequence. */
  offer(key: KeyEvent): boolean
  /**
   * Offers a key that just broke off a pending sequence once more, with the
   * chord still counting as pending: the keymap does not dispatch a key that
   * misses a sequence from the root, and the chain asked the chat ahead of
   * its sequences while every later branch declined under a chord.
   */
  reoffer(key: KeyEvent): boolean
  /**
   * A sequence waits for its next key, or a key that broke one off is being
   * offered again. Not for a layer's `enabled`, which the keymap evaluates
   * inside its own pending check, so the call would recurse: read it in `run`.
   */
  chordPending(): boolean
  /**
   * While `active(key)`, that key, when no binding takes it, is kept from
   * the chain and handed to `rest`, for a modal that owns the keyboard. Of
   * two active captures the later registered one wins. Returns the
   * unregister.
   */
  capture(active: (key: KeyEvent) => boolean, rest?: (key: KeyEvent) => void): Captured
  /**
   * Whether any capture holds the key being offered. A layer that must
   * answer outside every modal, and inside its own, stands aside on this
   * under any modal that outranks it.
   */
  held(): boolean
}

export type Captured = (() => void) & {
  /**
   * Whether this capture is the one holding the key being offered: active
   * for it, with no later registered capture active ahead of it. A layer
   * enabled by this alone stands aside under every modal that outranks it,
   * even for keys that modal leaves unbound.
   */
  holds(): boolean
}

interface Capture {
  active: (key: KeyEvent) => boolean
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
  let holding: Capture | undefined
  let breaking = false

  const offer = (key: KeyEvent) => {
    // Read before the key runs: a key that closes the modal (Esc in flash,
    // y on the dialog) arrived while it was up, and the chain must not see it.
    const capturing = captures.find((c) => c.active(key))
    handled = false
    holding = capturing
    feed?.(key)
    holding = undefined
    if (handled) return true
    if (!capturing) return false
    capturing.rest?.(key)
    return true
  }

  return {
    keymap,
    offer,
    reoffer(key) {
      breaking = true
      try {
        return offer(key)
      } finally {
        breaking = false
      }
    },
    chordPending: () => keymap.hasPendingSequence() || breaking,
    held: () => holding !== undefined,
    capture(active, rest) {
      const capture: Capture = { active, rest }
      // Newest first: the keymap prefers the later registered of two layers
      // binding a key, and a modal's capture must rank as its layer does.
      captures.unshift(capture)
      const unregister = () => {
        const at = captures.indexOf(capture)
        if (at >= 0) captures.splice(at, 1)
      }
      return Object.assign(unregister, { holds: () => holding === capture })
    },
  }
}
