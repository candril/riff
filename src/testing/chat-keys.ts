import { expect } from "bun:test"
import type { GlobalKeyContext } from "../app/global-keys"
import { createAppKeys } from "../app/keys"
import type { mountApp } from "./app-render"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { toggleSplitView } from "../state"
import { VimMotionHandler } from "../vim-diff/motion-handler"

type Mounted = Awaited<ReturnType<typeof mountApp>>

/**
 * riff's key handler on the app's render pass, wired for the chat and the
 * focus walk. Anything else it calls throws, so a key that leaks past the
 * chat into the diff shows up here.
 */
export function keysOn(mounted: Mounted, more: Partial<GlobalKeyContext> = {}) {
  const { ctx: render } = mounted
  let vimState = render.getVimState()
  const quits: number[] = []
  const setVimState = (next: typeof vimState) => {
    vimState = next
    mounted.setVimState(next)
  }
  const known: Partial<GlobalKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    getVimState: () => vimState,
    setVimState,
    toggleSplitView: () => {
      mounted.show(toggleSplitView(render.getState()))
      if (render.getState().splitView) render.split.enter()
      mounted.render()
    },
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    quit: () => void quits.push(1),
    reviewPreviewOpenContext: {
      getState: render.getState,
      setState: render.setState,
      render: mounted.render,
      getCachedCurrentUser: () => null,
      setCachedCurrentUser() {},
      mode: "local",
    },
    readReviewSummary: mounted.islands.reviewPreview.summaryValue,
    composer: render.threadPanel.composer,
    chat: { state: mounted.chat, input: mounted.chatColumn.input },
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
    composerSettled: undefined,
    ...more,
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof GlobalKeyContext]
      return () => {
        throw new Error(`a chat key reached ctx.${String(name)}`)
      }
    },
  }) as GlobalKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createAppKeys(mounted.setup.renderer, ctx))
  // Where a search or a flash jump would land the cursor, without walking there.
  const jumpTo = (line: number) => setVimState({ ...vimState, line })
  return { quits, vimState: () => vimState, jumpTo }
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
