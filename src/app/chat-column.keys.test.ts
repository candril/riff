import { afterEach, describe, expect, test } from "bun:test"
import { createKeyHandler, type GlobalKeyContext } from "./global-keys"
import { mountApp } from "../testing/app-render"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { openInlineCommentOverlay, toggleSplitView } from "../state"
import { CHAT_HINT } from "../features/chat/ChatPane"
import { VimMotionHandler } from "../vim-diff/motion-handler"

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

const THREE_ADDED = `diff --git a/src/sum.ts b/src/sum.ts
index 1111111..2222222 100644
--- a/src/sum.ts
+++ b/src/sum.ts
@@ -1,2 +1,5 @@
 export function sum() {
+  const b = 2
+  const c = 3
+  const d = 4
   return 1
`

// In the right pane the row of "  }" has an empty half.
const CART = `diff --git a/src/cart.ts b/src/cart.ts
index 1111111..2222222 100644
--- a/src/cart.ts
+++ b/src/cart.ts
@@ -1,7 +1,3 @@
-let total = 0
-for (const item of items) {
-  total += item.price
-  }
-return total
+return items.length
 }
 tail
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
  expect(app.agent.positions).toEqual([{ path: "src/greet.ts", excerpt: [], label: "src/greet.ts" }])
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

function moveTo(mounted: NonNullable<typeof app>, vimState: () => { line: number }, content: string) {
  const target = mounted.ctx.getLineMapping().allLines.findIndex((line) => line.content === content)
  expect(target).toBeGreaterThan(vimState().line)
  while (vimState().line < target) mounted.setup.mockInput.pressKey("j")
}

describe("a question carries the reviewer's place in the diff", () => {
  test("on an added line, the agent gets its file, side and line, and the chat shows them above the question", async () => {
    app = await mountApp(DIFF, { width: 120, height: 24 })
    app.show()
    const { vimState } = keysOn(app)
    moveTo(app, vimState, '  return "hello"')

    ctrl(app, "r")
    await app.setup.mockInput.typeText("why hello")
    app.setup.mockInput.pressEnter()

    expect(app.agent.asked).toEqual(["why hello"])
    expect(app.agent.positions[0]).toMatchObject({
      path: "src/greet.ts",
      side: "new",
      line: 2,
      hunkHeader: "@@ -1,3 +1,3 @@",
      label: "src/greet.ts:2",
    })
    const lines = (await app.frame()).split("\n")
    const question = lines.findIndex((line) => line.includes("› why hello"))
    expect(question).toBeGreaterThan(0)
    expect(lines[question - 1]).toContain("src/greet.ts:2")
  })

  test("from visual-line mode, the selection goes along and the label gives its range", async () => {
    app = await mountApp(THREE_ADDED, { width: 120, height: 24 })
    app.show()
    const { vimState } = keysOn(app)
    moveTo(app, vimState, "  const b = 2")

    app.setup.mockInput.pressKey("V")
    app.setup.mockInput.pressKey("j")
    app.setup.mockInput.pressKey("j")
    ctrl(app, "r")
    expect(vimState()).toMatchObject({ mode: "visual-line" })
    await app.setup.mockInput.typeText("these three")
    app.setup.mockInput.pressEnter()

    expect(app.agent.positions[0]).toMatchObject({
      path: "src/sum.ts",
      side: "new",
      line: 4,
      selection: { start: 2, end: 4 },
      label: "src/sum.ts:2-4",
    })
    const lines = (await app.frame()).split("\n")
    const question = lines.findIndex((line) => line.includes("› these three"))
    expect(lines[question - 1]).toContain("src/sum.ts:2-4")
  })

  test("a one-line selection is labelled with its line alone", async () => {
    app = await mountApp(THREE_ADDED, { width: 120, height: 24 })
    app.show()
    const { vimState } = keysOn(app)
    moveTo(app, vimState, "  const c = 3")

    app.setup.mockInput.pressKey("V")
    ctrl(app, "r")
    await app.setup.mockInput.typeText("just this")
    app.setup.mockInput.pressEnter()

    expect(app.agent.positions[0]).toMatchObject({ selection: { start: 3, end: 3 }, label: "src/sum.ts:3" })
    const frame = await app.frame()
    const lines = frame.split("\n")
    const question = lines.findIndex((line) => line.includes("› just this"))
    expect(lines[question - 1]).toContain("src/sum.ts:3")
    expect(frame).not.toContain("src/sum.ts:3-3")
  })

  test("in split, a cursor on an empty right half asks from the nearest line in that pane", async () => {
    app = await mountApp(CART, { width: 240, height: 24 })
    app.show()
    const { jumpTo } = keysOn(app)
    app.setup.mockInput.pressKey("\\")
    expect(app.ctx.getState().splitView).toBe(true)
    jumpTo(app.ctx.getLineMapping().allLines.findIndex((line) => line.content === "  }"))

    ctrl(app, "r")
    await app.setup.mockInput.typeText("what about this")
    app.setup.mockInput.pressEnter()

    expect(app.agent.positions[0]).toMatchObject({ path: "src/cart.ts", side: "new", line: 2, label: "src/cart.ts:2" })
    const frame = await app.frame()
    expect(app.ctx.split.shown()).toBe(true)
    const lines = frame.split("\n")
    const question = lines.findIndex((line) => line.includes("› what about this"))
    expect(lines[question - 1]).toContain("src/cart.ts:2")
  })
})
