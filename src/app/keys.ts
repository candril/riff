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
import { registerChatKeys } from "../features/chat/keys"
import { registerComposerKeys } from "../features/inline-comment-overlay/composer-keys"
import { registerThreadPanelKeys } from "../features/inline-comment-overlay/view-keys"
import { registerPrInfoPanelKeys } from "../features/pr-info-panel/keys"
import { registerFeedKeys } from "../features/feed/keys"
import { composerKeyDeps } from "./composer-key-deps"
import { threadPanelKeyDeps } from "./thread-panel-key-deps"
import { prInfoPanelKeyDeps } from "./pr-info-panel-key-deps"
import { feedKeyDeps } from "./feed-key-deps"
import { blameKeysContext } from "./blame-key-deps"
import { registerPeekKeys } from "./peek-keys"
import { registerTextObjectKeys } from "./text-object-keys"
import { registerPromptKeys } from "./prompt-keys"
import { createBlameKeys } from "../features/blame/keys"
import { createLinksPicker } from "./links-picker"
import { createOpenLink } from "./open-link"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"

/**
 * Every keymap layer in front of the priority chain (ADR-002), built once
 * here so the app and the keys tests dispatch through the same layers.
 * The renderer comes apart from ctx, whose `renderer` is only its height.
 */
export function createAppKeys(renderer: CliRenderer, ctx: GlobalKeyContext): KeyHandler {
  const riffKeymap = createRiffKeymap(renderer)
  const blame = createBlameKeys(blameKeysContext(ctx))
  const legacy = createKeyHandler(ctx, blame)
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => renderer.console.toggle() })
  // Each group registers ahead of the one the chain asked before it, since
  // later registration wins: flash, the dialog and the palette came first,
  // then the four query pickers, the commit picker, the sync preview,
  // Submit Review, the help overlay, the chat, the thread panel in its two
  // modes, the PR overview, the activity feed, the search and tree filter
  // prompts and the blame and line peeks. A pending text object registers
  // behind them all although the chain asked it before the tree filter
  // prompt and the peeks, and the order makes no difference: the prompt
  // needs the tree focused and the text object the diff, and the peeks
  // stand aside for a pending text object through peekLeaves, so none of
  // them is ever active together with it. The composer never competes with
  // the chat, which stands aside while it is open, view mode and compose
  // mode are never active together, and nor are the overview and the feed,
  // which are views of their own.
  const links = createLinksPicker(ctx)
  registerTextObjectKeys(riffKeymap, {
    getState: ctx.getState,
    getVimState: ctx.getVimState,
    searchActive: () => ctx.getSearchState().active,
    feed: (key) => ctx.vimHandler.handleKey({ name: key.name, sequence: key.sequence, ctrl: key.ctrl, shift: key.shift }),
    render: ctx.render,
    settleChainChord: (key) => legacy.settleChord(key),
  })
  registerPeekKeys(riffKeymap, ctx, legacy, blame)
  registerPromptKeys(riffKeymap, ctx, legacy)
  registerFeedKeys(riffKeymap, feedKeyDeps(ctx, legacy))
  registerPrInfoPanelKeys(riffKeymap, prInfoPanelKeyDeps(ctx, links, legacy))
  registerThreadPanelKeys(riffKeymap, threadPanelKeyDeps(ctx, links, legacy))
  registerComposerKeys(riffKeymap, composerKeyDeps(ctx, legacy))
  registerChatKeys(riffKeymap, {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    getVimState: ctx.getVimState,
    getSearchState: ctx.getSearchState,
    chat: ctx.chat,
    clearChainChord: () => legacy.clearChord(),
    settleChainChord: (key) => legacy.settleChord(key),
  })
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
