/**
 * Flash jump keys (specs 022, 066).
 *
 * Flash captures every key while active: printable characters either
 * narrow the search or fire a label, and everything else is swallowed so
 * a stray motion can't run half-way through a jump. A label is typed into
 * whichever surface is being labelled, so that surface's own keys must not
 * see it first.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
import type { FlashState } from "../../vim-diff/flash-state"
import type { FlashHandler } from "../../vim-diff/flash-handler"

export interface FlashKeyDeps {
  getFlashState: () => FlashState
  flashHandler: () => FlashHandler
}

export function registerFlashKeys(riffKeymap: RiffKeymap, deps: FlashKeyDeps): () => void {
  const active = () => deps.getFlashState().active
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: active,
    commands: [
      {
        name: "flash.cancel",
        title: "Cancel the flash jump",
        category: "Flash",
        palette: false,
        run: () => deps.flashHandler().cancel(),
      },
      {
        name: "flash.backspace",
        title: "Take back the last character typed",
        category: "Flash",
        palette: false,
        run: () => deps.flashHandler().handleBackspace(),
      },
    ],
    bindings: [
      ...anyModifiers("escape", "flash.cancel"),
      ...anyModifiers("ctrl+c", "flash.cancel"),
      ...anyModifiers("return", "flash.cancel"),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, and the chain took both.
      ...anyModifiers("enter", "flash.cancel"),
      ...anyModifiers("backspace", "flash.backspace"),
    ],
  })
  const unregisterCapture = riffKeymap.capture(active, (key) => {
    if (key.sequence?.length === 1 && !key.ctrl && !key.meta) deps.flashHandler().handleChar(key.sequence)
  })
  return () => {
    unregisterCapture()
    unregisterLayer()
  }
}
