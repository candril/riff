import type { CliRenderer, KeyEvent } from "@opentui/core"
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
import { chatReaches, registerChatKeys } from "../features/chat/keys"
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
import { registerGlobalKeys } from "./global-layer-keys"
import { globalLayerKeyDeps } from "./global-layer-key-deps"
import { registerTreeKeys } from "../features/file-tree/keys"
import { treeKeyDeps } from "./tree-key-deps"
import { registerBracketKeys } from "./bracket-keys"
import { bracketKeyDeps } from "./bracket-key-deps"
import { BRACKET_SEQUENCES } from "./bracket-commands"
import { registerChordStrokes, sequenceSuffixes } from "./chord-stroke"
import { registerZChordKeys } from "./z-chord-keys"
import { zChordKeyDeps } from "./z-chord-key-deps"
import { Z_SEQUENCES } from "./z-chord-commands"
import { registerGChordKeys } from "./g-chord-keys"
import { gChordKeyDeps } from "./g-chord-key-deps"
import { G_SEQUENCES } from "./g-chord-commands"
import { expireSequenceOpeners } from "./sequence-expiry"
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
  const legacy = createKeyHandler(ctx)
  // Whether the chain holds a chord, for every layer that gives way to one:
  // the chain's own mark chord or a bracket, `z` or `g` sequence the keymap
  // holds, which the chain asked as one of its own.
  const chain = {
    chordPending: () => legacy.chordPending() || riffKeymap.chordPending(),
    chordPendingAfter: (key: KeyEvent) => legacy.chordPendingAfter(key) || riffKeymap.chordPending(),
    settleChord: (key: KeyEvent) => legacy.settleChord(key),
    clearChord: () => legacy.clearChord(),
  }
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => renderer.console.toggle() })
  // Each group registers ahead of the one the chain asked before it, since
  // later registration wins: flash, the dialog and the palette came first,
  // then the four query pickers, the commit picker, the sync preview,
  // Submit Review, the help overlay, the chat, the thread panel in its two
  // modes, the PR overview, the activity feed, the search and tree filter
  // prompts and the blame and line peeks. A pending text object registers
  // behind them although the chain asked it before the tree filter prompt
  // and the peeks, and the order makes no difference: the prompt needs the
  // tree focused and the text object the diff, and the peeks stand aside
  // for a pending text object through peekLeaves, so none of them is ever
  // active together with it. The bracket, `z` and `g` sequences register
  // first, behind every other layer, as the chain asked them after the
  // global keys and before the tree; their openers differ, so their order
  // among them makes no difference. Each is handed the chain's own chord
  // rather than the composed one, which its own pending sequence is part
  // of. The tree registers next, behind the global keys, as the chain asked
  // it after them and after its chords. The global keys register after it,
  // behind every modal layer, as the chain asked them after its modal
  // branches, and stand aside while any capture holds the key. The composer
  // never competes with the chat, which stands aside while it is open, view
  // mode and compose mode are never active together, and nor are the
  // overview and the feed, which are views of their own.
  const links = createLinksPicker(ctx)
  const askedFirst = (key: KeyEvent) => chatReaches(key, ctx.getState(), ctx.getSearchState().active)
  registerChordStrokes(riffKeymap.keymap, sequenceSuffixes(BRACKET_SEQUENCES, Z_SEQUENCES, G_SEQUENCES), askedFirst)
  expireSequenceOpeners(riffKeymap, ["]", "[", "z", "g"])
  registerBracketKeys(riffKeymap, bracketKeyDeps(ctx, legacy))
  registerZChordKeys(riffKeymap, zChordKeyDeps(ctx, legacy))
  registerGChordKeys(riffKeymap, gChordKeyDeps(ctx, blame, legacy, askedFirst))
  registerTreeKeys(riffKeymap, treeKeyDeps(ctx, chain))
  registerGlobalKeys(riffKeymap, globalLayerKeyDeps(ctx, chain))
  registerTextObjectKeys(riffKeymap, {
    getState: ctx.getState,
    getVimState: ctx.getVimState,
    searchActive: () => ctx.getSearchState().active,
    feed: (key) => ctx.vimHandler.handleKey({ name: key.name, sequence: key.sequence, ctrl: key.ctrl, shift: key.shift }),
    render: ctx.render,
    settleChainChord: (key) => chain.settleChord(key),
  })
  registerPeekKeys(riffKeymap, ctx, chain, blame)
  registerPromptKeys(riffKeymap, ctx, chain)
  registerFeedKeys(riffKeymap, feedKeyDeps(ctx, chain))
  registerPrInfoPanelKeys(riffKeymap, prInfoPanelKeyDeps(ctx, links, chain))
  registerThreadPanelKeys(riffKeymap, threadPanelKeyDeps(ctx, links, chain))
  registerComposerKeys(riffKeymap, composerKeyDeps(ctx, chain))
  registerChatKeys(riffKeymap, {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    getVimState: ctx.getVimState,
    getSearchState: ctx.getSearchState,
    chat: ctx.chat,
    clearChainChord: () => chain.clearChord(),
    settleChainChord: (key) => chain.settleChord(key),
  })
  registerHelpKeys(riffKeymap, {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    height: () => ctx.renderer.height,
    // Help gives way to a chord the chain holds, such as the g of `g?`.
    chainChordPending: () => chain.chordPending(),
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
