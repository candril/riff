import type { CliRenderer } from "@opentui/core"
import { createRiffKeymap, type RiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerAppKeys } from "./app-keys"
import { registerConfirmKeys, type ConfirmKeyDeps } from "./confirm-keys"
import { registerFlashKeys, type FlashKeyDeps } from "../features/flash/keys"
import { registerActionMenuKeys, type ActionMenuKeyDeps } from "../features/action-menu/keys"
import { registerPickerKeys } from "./picker-keys"
import { registerCommitPickerKeys } from "../features/commit-picker"
import { registerPreviewKeys } from "./preview-keys"
import { registerHelpKeys } from "./help-keys"
import { createOpenLink } from "./open-link"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"

/**
 * Every keymap layer in front of the priority chain (ADR-002), built once
 * here so the app and the keys tests dispatch through the same layers.
 * The renderer comes apart from ctx, whose `renderer` is only its height.
 */
export function createAppKeys(renderer: CliRenderer, ctx: GlobalKeyContext): KeyHandler {
  const riffKeymap = createRiffKeymap(renderer)
  const legacy = createKeyHandler(ctx)
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => renderer.console.toggle() })
  // Each group registers ahead of the one the chain asked before it, since
  // later registration wins: flash, the dialog and the palette came first,
  // then the four query pickers, the commit picker, the sync preview,
  // Submit Review and the help overlay.
  registerHelpKeys(riffKeymap, {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    height: () => ctx.renderer.height,
    // The chain's own pending key, not the composed one: help gives way to
    // a chord the chain holds, such as the g of `g?`.
    chainChordPending: () => legacy.chordPending(),
  })
  registerPreviewKeys(riffKeymap, ctx)
  registerCommitPickerKeys(riffKeymap, {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    onCommitSelected: (sha, filename, scope) => ctx.onCommitSelected(sha, filename, scope),
  })
  registerPickerKeys(riffKeymap, ctx)
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
  return composeKeys(riffKeymap, legacy)
}

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
