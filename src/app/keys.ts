import type { CliRenderer, KeyEvent, Renderable } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import { createRiffKeymap, type RiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { commandKeys } from "./command-keys"
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
import { openQuestionInEditor } from "./chat-editor"
import { threadPanelKeyDeps } from "./thread-panel-key-deps"
import { prInfoPanelKeyDeps } from "./pr-info-panel-key-deps"
import { feedKeyDeps } from "./feed-key-deps"
import { blameKeysContext } from "./blame-key-deps"
import { registerPeekKeys } from "./peek-keys"
import { registerTextObjectKeys } from "./text-object-keys"
import { registerPromptKeys } from "./prompt-keys"
import { registerGlobalKeys } from "./global-layer-keys"
import { globalLayerKeyDeps } from "./global-layer-key-deps"
import { registerTreeKeys, treeLeftover } from "../features/file-tree/keys"
import { treeKeyDeps } from "./tree-key-deps"
import { registerBracketKeys } from "./bracket-keys"
import { bracketDeps } from "./bracket-key-deps"
import { BRACKET_SEQUENCES } from "./bracket-commands"
import { registerChordStrokes, sequenceSuffixes } from "./chord-stroke"
import { registerZChordKeys } from "./z-chord-keys"
import { zChordDeps } from "./z-chord-key-deps"
import { Z_SEQUENCES } from "./z-chord-commands"
import { registerGChordKeys } from "./g-chord-keys"
import { gChordKeyDeps } from "./g-chord-key-deps"
import { G_SEQUENCES } from "./g-chord-commands"
import { expireSequenceOpeners } from "./sequence-expiry"
import { registerMarkChordKeys } from "./mark-chord-keys"
import { markChordKeyDeps } from "./mark-chord-key-deps"
import { createBlameKeys } from "../features/blame/keys"
import { createLinksPicker } from "./links-picker"
import { createOpenLink } from "./open-link"
import type { AppKeyContext } from "./key-context"
import { registerDiffKeys } from "../features/diff-view/keys"
import { diffKeyDeps } from "./diff-key-deps"

/**
 * `commandKeys`: the palette's hints, read off the layers once all of them
 * are registered. `keymap`: what the palette runs an action's command on.
 */
export type AppKeys = KeyHandler & { commandKeys: ReadonlyMap<string, string>; keymap: Keymap<Renderable, KeyEvent> }

/**
 * Every keymap layer, and the tree's leftover behind them (ADR-002), built
 * once here so the app and the keys tests dispatch through the same layers.
 * The renderer comes apart from ctx, whose `renderer` is only its height.
 */
export function createAppKeys(renderer: CliRenderer, ctx: AppKeyContext): AppKeys {
  const riffKeymap = createRiffKeymap(renderer)
  const blame = createBlameKeys(blameKeysContext(ctx))
  // Whether a chord waits for its second key, for every layer that gives
  // way to one: a mark, bracket, `z` or `g` sequence the keymap holds.
  const chord = { chordPending: () => riffKeymap.chordPending() }
  // Each group registers after the ones it must outrank, since later
  // registration wins. Highest first: flash, the dialog and the palette,
  // then the four query pickers, the commit picker, the sync preview,
  // Submit Review, the help overlay, the chat, the thread panel in its two
  // modes, the PR overview, the activity feed, the search and tree filter
  // prompts and the blame and line peeks. A pending text object registers
  // behind them, and the order makes no difference: the prompt needs the
  // tree focused and the text object the diff, and the peeks stand aside
  // for a pending text object through peekLeaves, so none of them is ever
  // active together with it. The global keys register behind every modal
  // layer and stand aside while any capture holds the key; the tree behind
  // them, so a key the global keys decline falls through to it; the
  // bracket, `z` and `g` sequences behind the tree. Their openers differ,
  // so their order among them makes no difference, and none reads the
  // pending chord: a pending sequence holds the next key itself. The mark
  // chords register behind those, and the diff behind every layer, the
  // mark chords included, so a key every layer above declines falls
  // through to it. The composer never competes with the chat, which stands
  // aside while it is open, view mode and compose mode are never active
  // together, and nor are the overview and the feed, which are views of
  // their own.
  registerDiffKeys(riffKeymap, diffKeyDeps(ctx, chord))
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => renderer.console.toggle() })
  const links = createLinksPicker(ctx)
  const askedFirst = (key: KeyEvent) => chatReaches(key, ctx.getState(), ctx.getSearchState().active, ctx)
  registerChordStrokes(riffKeymap.keymap, sequenceSuffixes(BRACKET_SEQUENCES, Z_SEQUENCES, G_SEQUENCES), askedFirst)
  expireSequenceOpeners(riffKeymap, ["]", "[", "z", "g"])
  const markChords = registerMarkChordKeys(riffKeymap, markChordKeyDeps(ctx, askedFirst))
  registerBracketKeys(riffKeymap, bracketDeps(ctx))
  registerZChordKeys(riffKeymap, zChordDeps(ctx))
  registerGChordKeys(riffKeymap, gChordKeyDeps(ctx, blame, askedFirst))
  const tree = treeKeyDeps(ctx, chord)
  registerTreeKeys(riffKeymap, tree)
  registerGlobalKeys(riffKeymap, globalLayerKeyDeps(ctx, chord))
  registerTextObjectKeys(riffKeymap, {
    getState: ctx.getState,
    getVimState: ctx.getVimState,
    searchActive: () => ctx.getSearchState().active,
    filePicker: ctx.filePicker,
    commentsPicker: ctx.commentsPicker,
    occurrencePicker: ctx.occurrencePicker,
    marksPicker: ctx.marksPicker,
    commitPicker: ctx.commitPicker,
    actionMenu: ctx.actionMenu,
    activityFeed: ctx.activityFeed,
    prInfoFilter: ctx.prInfoFilter,
    prCommentInput: ctx.prCommentInput,
    chat: ctx.chat,
    feed: (key) => ctx.vimHandler.handleKey({ name: key.name, sequence: key.sequence, ctrl: key.ctrl, shift: key.shift }),
    render: ctx.render,
  })
  registerPeekKeys(riffKeymap, ctx, chord, blame)
  registerPromptKeys(riffKeymap, ctx)
  registerFeedKeys(riffKeymap, feedKeyDeps(ctx, chord))
  registerPrInfoPanelKeys(riffKeymap, prInfoPanelKeyDeps(ctx, links))
  registerThreadPanelKeys(riffKeymap, threadPanelKeyDeps(ctx, links))
  registerComposerKeys(riffKeymap, composerKeyDeps(ctx))
  registerChatKeys(riffKeymap, {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    getVimState: ctx.getVimState,
    getSearchState: ctx.getSearchState,
    filePicker: ctx.filePicker,
    commentsPicker: ctx.commentsPicker,
    occurrencePicker: ctx.occurrencePicker,
    marksPicker: ctx.marksPicker,
    commitPicker: ctx.commitPicker,
    actionMenu: ctx.actionMenu,
    activityFeed: ctx.activityFeed,
    prInfoFilter: ctx.prInfoFilter,
    prCommentInput: ctx.prCommentInput,
    chat: ctx.chat,
    openQuestionInEditor: openQuestionInEditor(ctx),
  })
  registerHelpKeys(riffKeymap, {
    help: ctx.help,
    render: ctx.render,
    height: () => ctx.renderer.height,
    width: () => ctx.renderer.width,
    // Help gives way to a pending chord, such as the g of `g?`.
    chordPending: () => chord.chordPending(),
  })
  registerPreviewKeys(riffKeymap, ctx)
  registerCommitPickerKeys(riffKeymap, {
    getState: ctx.getState,
    commitPicker: ctx.commitPicker,
    render: ctx.render,
    onCommitSelected: (sha, filename, scope) => ctx.onCommitSelected(sha, filename, scope),
  })
  registerPickerKeys(riffKeymap, ctx)
  registerModalKeys(riffKeymap, {
    getState: ctx.getState,
    actionMenu: ctx.actionMenu,
    render: ctx.render,
    getVimState: ctx.getVimState,
    executeAction: ctx.executeAction,
    onToggleReaction: ctx.onToggleReaction,
    reactionTarget: ctx.reactionTarget,
    onLink: createOpenLink(ctx),
    getFlashState: ctx.getFlashState,
    flashHandler: () => ctx.flashHandler,
    confirm: ctx.confirm,
  })
  const keys = composeKeys(riffKeymap, treeLeftover(tree), markChords.settle)
  return Object.assign(keys, { commandKeys: commandKeys(riffKeymap.keymap), keymap: riffKeymap.keymap })
}

export function registerModalKeys(
  riffKeymap: RiffKeymap,
  deps: ConfirmKeyDeps & FlashKeyDeps & ActionMenuKeyDeps,
): void {
  // Later registration wins, for layers and captures alike. Flash outranks
  // the dialog, and the dialog the palette, so they register in the reverse
  // order.
  registerActionMenuKeys(riffKeymap, deps)
  registerConfirmKeys(riffKeymap, deps)
  registerFlashKeys(riffKeymap, deps)
}
