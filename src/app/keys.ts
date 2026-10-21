import type { CliRenderer } from "@opentui/core"
import { createRiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerAppKeys } from "./app-keys"
import { registerConfirmKeys } from "./confirm-keys"
import { registerFlashKeys } from "../features/flash/keys"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"

/**
 * Every keymap layer in front of the priority chain (ADR-002), built once
 * here so the app and the keys tests dispatch through the same layers.
 * The renderer comes apart from ctx, whose `renderer` is only its height.
 */
export function createAppKeys(renderer: CliRenderer, ctx: GlobalKeyContext): KeyHandler {
  const riffKeymap = createRiffKeymap(renderer)
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => renderer.console.toggle() })
  registerFlashKeys(riffKeymap, { getFlashState: ctx.getFlashState, flashHandler: () => ctx.flashHandler })
  registerConfirmKeys(riffKeymap, { getState: ctx.getState })
  return composeKeys(riffKeymap, createKeyHandler(ctx))
}
