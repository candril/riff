import type { CliRenderer } from "@opentui/core"
import { createRiffKeymap, type RiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerAppKeys } from "./app-keys"
import { registerConfirmKeys, type ConfirmKeyDeps } from "./confirm-keys"
import { registerFlashKeys, type FlashKeyDeps } from "../features/flash/keys"
import { registerActionMenuKeys, type ActionMenuKeyDeps } from "../features/action-menu/keys"
import { createOpenLink } from "./open-link"
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
    setState: ctx.setState,
    render: ctx.render,
    getVimState: ctx.getVimState,
    executeAction: ctx.executeAction,
    onToggleReaction: ctx.onToggleReaction,
    onLink: createOpenLink(ctx),
    getFlashState: ctx.getFlashState,
    flashHandler: () => ctx.flashHandler,
  })
  return composeKeys(riffKeymap, createKeyHandler(ctx))
}

/** The layers that own the keyboard while they are up. */
export function registerModalKeys(
  riffKeymap: RiffKeymap,
  deps: ConfirmKeyDeps & FlashKeyDeps & ActionMenuKeyDeps,
): void {
  // Later registration wins, for layers and captures alike. The chain these
  // layers replaced asked flash first, then the dialog, then the palette, so
  // they register in the reverse order.
  registerActionMenuKeys(riffKeymap, deps)
  registerConfirmKeys(riffKeymap, deps)
  registerFlashKeys(riffKeymap, deps)
}
