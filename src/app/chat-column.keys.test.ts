import { afterEach, describe, expect, test } from "bun:test"
import { mountApp, reloadCtx } from "../testing/app-render"
import { ctrl, keysOn, moveTo, openChat } from "../testing/chat-keys"
import { createInitialState, openInlineCommentOverlay } from "../state"
import { adoptReloadedState } from "../features/refresh/handlers"
import { capturePosition, restorePosition } from "../features/refresh/position"
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
  expect([app.chatColumnState.open(), state.focusedPanel]).toEqual([true, "chat"])
  const input = app.chatColumn.input()!
  expect(app.setup.renderer.currentFocusedRenderable).toBe(input)
  const opened = await app.frame()
  expect(opened.replace(/\s+/g, " ")).toContain("Ask about this review.")
  expect(diff.width).toBe(closedWidth - 48)

  await app.setup.mockInput.typeText("jq")
  expect(input.plainText).toBe("@file jq")
  expect(vimState()).toBe(before)
  expect(quits).toEqual([])
  expect(app.chatColumnState.open()).toBe(true)

  app.setup.mockInput.pressEnter()
  expect(app.agent.asked).toEqual(["@file jq"])
  expect(app.agent.positions).toEqual([{ path: "src/greet.ts", excerpt: [], label: "src/greet.ts" }])
  expect(input.plainText).toBe("")
  const asked = await app.frame()
  expect(asked).toContain("› @file jq")
  expect(asked.replace(/\s+/g, " ")).not.toContain(CHAT_HINT)

  ctrl(app, "r")
  expect([app.chatColumnState.open(), app.ctx.getState().focusedPanel]).toEqual([false, "diff"])
  expect(app.chatColumn.host.visible).toBe(false)
  expect(app.setup.renderer.currentFocusedRenderable).not.toBe(input)
  await app.frame()
  expect(diff.width).toBe(closedWidth)
})

test("Ctrl-r draws the column, a reload leaves it drawn, and Ctrl-r from inside takes it away", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  const mounted = app
  keysOn(mounted, {
    // handleRefresh's swap: the state built afresh, with the position put back over it.
    refreshContext: {
      handleRefresh: async () => {
        const { ctx } = mounted
        const position = capturePosition(ctx.getState(), ctx.getVimState(), ctx.getLineMapping(), ctx.getSearchState(), mounted.fileContent.expanded())
        adoptReloadedState(reloadCtx(mounted), (prev) =>
          restorePosition(createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"), position)
        )
        mounted.render()
      },
    },
  })
  const drawn = async () => (await mounted.frame()).replace(/\s+/g, " ")
  const diff = mounted.ctx.unified.island.host
  expect(await drawn()).not.toContain("Ask about this review.")
  const closedWidth = diff.width

  openChat(mounted)
  expect(await drawn()).toContain("Ask about this review.")
  expect(diff.width).toBe(closedWidth - 48)

  // gr is the diff's, so the keys go back there first.
  mounted.setup.mockInput.pressBackspace()
  expect(mounted.ctx.getState().focusedPanel).toBe("diff")
  await mounted.setup.mockInput.typeText("gr")
  expect(mounted.ctx.getState().description).toBe("reloaded")
  expect(await drawn()).toContain("Ask about this review.")
  expect(diff.width).toBe(closedWidth - 48)

  ctrl(mounted, "r")
  expect(mounted.ctx.getState().focusedPanel).toBe("chat")
  ctrl(mounted, "r")
  expect(await drawn()).not.toContain("Ask about this review.")
  expect(diff.width).toBe(closedWidth)
})

test("with the thread panel closed, Ctrl-l steps from the diff to the chat and Ctrl-h steps back", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  keysOn(app)
  openChat(app)
  app.setup.mockInput.pressBackspace()
  expect(app.ctx.getState().focusedPanel).toBe("diff")
  expect(app.chatColumnState.open()).toBe(true)
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
  openChat(app)
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
  openChat(app)
  await app.setup.mockInput.typeText("ab")
  app.setup.mockInput.pressBackspace()
  expect(app.chatColumn.input()!.plainText).toBe("a")
  expect(app.ctx.getState().focusedPanel).toBe("chat")
})

describe("a question carries the reviewer's place in the diff", () => {
  test("on an added line, the agent gets its file, side and line, and the chat shows them above the question", async () => {
    app = await mountApp(DIFF, { width: 120, height: 24 })
    app.show()
    const { vimState } = keysOn(app)
    moveTo(app, vimState, '  return "hello"')

    openChat(app)
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
    openChat(app)
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
    openChat(app)
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
    expect(app.diffOptions.splitView()).toBe(true)
    jumpTo(app.ctx.getLineMapping().allLines.findIndex((line) => line.content === "  }"))

    openChat(app)
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
