import type { CliRenderer } from "@opentui/core"
import { createRiffKeymap, type RiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerAppKeys } from "./app-keys"
import { registerConfirmKeys, type ConfirmKeyDeps } from "./confirm-keys"
import { registerFlashKeys, type FlashKeyDeps } from "../features/flash/keys"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"

/**
 * Every keymap layer in front of the priority chain (ADR-002), built once
 * here so the app and the keys tests dispatch through the same layers.
 * The renderer comes apart from ctx, whose `renderer` is only its height.
 */
export function createAppKeys(renderer: CliRenderer, ctx: GlobalKeyContext): KeyHandler {
  const riffKeymap = createRiffKeymap(renderer)
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => renderer.console.toggle() })
  registerModalKeys(riffKeymap, {
    getState: ctx.getState,
    getFlashState: ctx.getFlashState,
    flashHandler: () => ctx.flashHandler,
  })
  return composeKeys(riffKeymap, createKeyHandler(ctx))
}

/** The layers that own the keyboard while they are up. */
export function registerModalKeys(riffKeymap: RiffKeymap, deps: ConfirmKeyDeps & FlashKeyDeps): void {
  // Later registration wins, for layers and captures alike. Flash goes after
  // the dialog because the chain these layers replaced asked flash first.
  registerConfirmKeys(riffKeymap, deps)
  registerFlashKeys(riffKeymap, deps)
}
