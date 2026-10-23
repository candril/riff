import { expect } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import type { AppKeyContext } from "../app/key-context"
import { createAppKeys, type AppKeys } from "../app/keys"
import { failOnKeymapErrors } from "./keymap-errors"
import type { mountApp } from "./app-render"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { VimMotionHandler } from "../vim-diff/motion-handler"

type Mounted = Awaited<ReturnType<typeof mountApp>>

/**
 * riff's key handler on the app's render pass, wired for the chat and the
 * focus walk. Anything else it calls throws, so a key that leaks past the
 * chat into the diff shows up here.
 */
export function keysOn(
  mounted: Mounted,
  more: Partial<AppKeyContext> = {},
  around: (key: KeyEvent, dispatch: () => void) => void = (_key, dispatch) => dispatch(),
) {
  return wireKeys(mounted, more, around, failOnKeymapErrors)
}

/**
 * keysOn without the guard, for a test that means a command to throw on
 * the context it leaves unwired, or that wires keys where no test is
 * running, such as at module load.
 */
export function unguardedKeysOn(mounted: Mounted, more: Partial<AppKeyContext> = {}) {
  return wireKeys(mounted, more, (_key, dispatch) => dispatch(), (keys) => keys)
}

function wireKeys(
  mounted: Mounted,
  more: Partial<AppKeyContext>,
  around: (key: KeyEvent, dispatch: () => void) => void,
  guard: (keys: AppKeys) => AppKeys,
) {
  const { ctx: render } = mounted
  let vimState = render.getVimState()
  const quits: number[] = []
  const setVimState = (next: typeof vimState) => {
    vimState = next
    mounted.setVimState(next)
  }
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    getVimState: () => vimState,
    setVimState,
    // app.ts's handleToggleSplitView, whose redrawDiff this spells out.
    toggleSplitView: () => {
      mounted.diffOptions.toggleSplit()
      if (mounted.diffOptions.splitView()) render.split.enter()
      mounted.render()
      ctx.ensureCursorVisible()
      if (render.split.shown()) render.split.refreshCursor()
      else render.unified.refreshCursor()
    },
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    quit: () => void quits.push(1),
    reviewPreviewOpenContext: {
      getState: render.getState,
      reviewPreview: mounted.reviewPreview,
      render: mounted.render,
      // Known already, so opening Submit Review on a PR never asks gh who is reviewing.
      getCachedCurrentUser: () => "octo",
      setCachedCurrentUser() {},
    },
    readReviewSummary: mounted.islands.reviewPreview.summaryValue,
    composer: render.threadPanel.composer,
    chat: { state: mounted.chat, column: mounted.chatColumnState, input: mounted.chatColumn.input, atPicker: mounted.chatColumn.atPicker },
    help: mounted.help,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
    toast: mounted.toast,
    prCommentInput: mounted.prCommentInput,
    prInfoFilter: mounted.prInfoFilter,
    diffOptions: mounted.diffOptions,
    blockFolds: mounted.blockFolds,
    fileFolds: mounted.fileFolds,
    filePicker: mounted.filePicker,
    commentsPicker: mounted.commentsPicker,
    occurrencePicker: mounted.occurrencePicker,
    marksPicker: mounted.marksPicker,
    marks: mounted.marks,
    commitPicker: mounted.commitPicker,
    actionMenu: mounted.actionMenu,
    activityFeed: mounted.activityFeed,
    visit: mounted.visit,
    linePeek: mounted.linePeek,
    blamePeek: mounted.blamePeek,
    blameColumns: mounted.blameColumns,
    mentions: mounted.mentions,
    commentDrafts: mounted.commentDrafts,
    jumpList: mounted.jumpList,
    getLineMapping: render.getLineMapping,
    ensureCursorVisible: () => {},
    vimHandler: new VimMotionHandler({
      getMapping: render.getLineMapping,
      getState: () => vimState,
      setState: (next) => {
        vimState = next
        mounted.setVimState(next)
      },
      getViewportHeight: () => 20,
      onCursorMove: () => mounted.render(),
    }),
    reactionTarget: render.reactionTarget,
    composerSettled: undefined,
    ...more,
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      return () => {
        throw new Error(`a chat key reached ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  const keys = guard(createAppKeys(mounted.setup.renderer, ctx))
  mounted.setCommandKeys(keys.commandKeys)
  // `around` stands where app.ts's jump recording does, so a test can record through it.
  mounted.setup.renderer.keyInput.on("keypress", (key: KeyEvent) => around(key, () => keys(key)))
  // Where a search or a flash jump would land the cursor, without walking there.
  const jumpTo = (line: number) => setVimState({ ...vimState, line })
  const setVim = (patch: Partial<typeof vimState>) => setVimState({ ...vimState, ...patch })
  return { quits, vimState: () => vimState, jumpTo, setVim, chordPending: () => keys.chordPending(), commandKeys: keys.commandKeys, keymap: keys.keymap }
}

export const ctrl = (mounted: Mounted, name: string) => mounted.setup.mockInput.pressKey(name, { ctrl: true })

/** Opens the chat and empties what Ctrl-r put in its input, for tests about something else. */
export function openChat(mounted: Mounted) {
  ctrl(mounted, "r")
  mounted.chatColumn.input()?.clear()
}

export function moveTo(mounted: Mounted, vimState: () => { line: number }, content: string) {
  const target = mounted.ctx.getLineMapping().allLines.findIndex((line) => line.content === content)
  expect(target).toBeGreaterThan(vimState().line)
  while (vimState().line < target) mounted.setup.mockInput.pressKey("j")
}
