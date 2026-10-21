import { expect } from "bun:test"
import { createKeyHandler, type GlobalKeyContext } from "../app/global-keys"
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
export function keysOn(mounted: Mounted) {
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
    readReviewSummary: render.reviewPreview.summaryValue,
    chat: { state: render.chat, input: render.chatColumn.input },
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
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof GlobalKeyContext]
      return () => {
        throw new Error(`a chat key reached ctx.${String(name)}`)
      }
    },
  }) as GlobalKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createKeyHandler(ctx))
  // Where a search or a flash jump would land the cursor, without walking there.
  const jumpTo = (line: number) => setVimState({ ...vimState, line })
  return { quits, vimState: () => vimState, jumpTo }
}

export const ctrl = (mounted: Mounted, name: string) => mounted.setup.mockInput.pressKey(name, { ctrl: true })

/** Opens the chat and empties what Ctrl-r put in its input, for tests about something else. */
export function openChat(mounted: Mounted) {
  ctrl(mounted, "r")
  mounted.ctx.chatColumn.input()?.clear()
}

export function moveTo(mounted: Mounted, vimState: () => { line: number }, content: string) {
  const target = mounted.ctx.getLineMapping().allLines.findIndex((line) => line.content === content)
  expect(target).toBeGreaterThan(vimState().line)
  while (vimState().line < target) mounted.setup.mockInput.pressKey("j")
}
