import { afterEach, expect, test } from "bun:test"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"
import { mountApp } from "../testing/app-render"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { openInlineCommentOverlay } from "../state"
import { CHAT_HINT } from "../features/chat/ChatPane"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/**
 * riff's key handler on the app's render pass, wired for the chat and the
 * focus walk. Anything else it calls throws, so a key that leaks past the
 * chat into the diff shows up here.
 */
function keysOn(mounted: NonNullable<typeof app>) {
  const { ctx: render } = mounted
  let vimState = render.getVimState()
  const quits: number[] = []
  const known: Partial<GlobalKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    getVimState: () => vimState,
    setVimState: (next) => {
      vimState = next
      mounted.setVimState(next)
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
  return { quits, vimState: () => vimState }
}

const ctrl = (mounted: NonNullable<typeof app>, name: string) => mounted.setup.mockInput.pressKey(name, { ctrl: true })

test("Ctrl-r opens the column with the keys in its input, and typed letters stay there", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  const { quits, vimState } = keysOn(app)
  const before = vimState()
  const diff = app.ctx.unified.island.host
  await app.frame()
  const closedWidth = diff.width

  ctrl(app, "r")
  const state = app.ctx.getState()
  expect([state.chatOpen, state.focusedPanel]).toEqual([true, "chat"])
  const input = app.ctx.chatColumn.input()!
  expect(app.setup.renderer.currentFocusedRenderable).toBe(input)
  const opened = await app.frame()
  expect(opened.replace(/\s+/g, " ")).toContain("Ask about this review.")
  expect(diff.width).toBe(closedWidth - 48)

  await app.setup.mockInput.typeText("jq")
  expect(input.plainText).toBe("jq")
  expect(vimState()).toBe(before)
  expect(quits).toEqual([])
  expect(app.ctx.getState().chatOpen).toBe(true)

  app.setup.mockInput.pressEnter()
  expect(app.agent.asked).toEqual(["jq"])
  expect(app.agent.positions).toEqual([null])
  expect(input.plainText).toBe("")
  const asked = await app.frame()
  expect(asked).toContain("› jq")
  expect(asked.replace(/\s+/g, " ")).not.toContain(CHAT_HINT)

  ctrl(app, "r")
  expect([app.ctx.getState().chatOpen, app.ctx.getState().focusedPanel]).toEqual([false, "diff"])
  expect(app.ctx.chatColumn.host.visible).toBe(false)
  expect(app.setup.renderer.currentFocusedRenderable).not.toBe(input)
  await app.frame()
  expect(diff.width).toBe(closedWidth)
})

test("with the thread panel closed, Ctrl-l steps from the diff to the chat and Ctrl-h steps back", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  keysOn(app)
  ctrl(app, "r")
  app.setup.mockInput.pressBackspace()
  expect(app.ctx.getState().focusedPanel).toBe("diff")
  expect(app.ctx.getState().chatOpen).toBe(true)
  ctrl(app, "l")
  expect(app.ctx.getState().focusedPanel).toBe("chat")
  ctrl(app, "l")
  expect(app.ctx.getState().focusedPanel).toBe("chat")
})

test("with the thread panel open, the walk runs diff → threads → chat and back", async () => {
  app = await mountApp(DIFF, { width: 160, height: 24 })
  app.show()
  keysOn(app)
  const walk: string[] = []
  const at = () => walk.push(app!.ctx.getState().focusedPanel)
  app.show({ ...openInlineCommentOverlay(app.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"), focusedPanel: "diff" })
  ctrl(app, "r")
  at()
  app.setup.mockInput.pressBackspace()
  at()
  app.setup.mockInput.pressBackspace()
  at()
  ctrl(app, "l")
  at()
  ctrl(app, "l")
  at()
  expect(walk).toEqual(["chat", "comments", "diff", "comments", "chat"])
})

test("in the chat, backspace deletes what is typed before it walks anywhere", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  keysOn(app)
  ctrl(app, "r")
  await app.setup.mockInput.typeText("ab")
  app.setup.mockInput.pressBackspace()
  expect(app.ctx.chatColumn.input()!.plainText).toBe("a")
  expect(app.ctx.getState().focusedPanel).toBe("chat")
})
