import { afterEach, expect, test } from "bun:test"
import { createMockKeys, type TestRendererSetup } from "@opentui/core/testing"
import { mountApp } from "../../testing/app-render"
import { ctrl, keysOn, openChat } from "../../testing/chat-keys"
import { openFilePicker, openInlineCommentOverlay } from "../../state"
import { NEW_CONVERSATION_PROMPT } from "./state"

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

type App = Awaited<ReturnType<typeof mountApp>>

let app: App | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

async function mounted(width = 120) {
  app = await mountApp(DIFF, { width, height: 24 })
  app.show()
  return app
}

// A lone ESC byte is held back a moment, in case it starts an escape sequence.
async function escape(keys: TestRendererSetup["mockInput"]) {
  keys.pressEscape()
  await Bun.sleep(50)
}

// The mock's default encoding drops shift and super from Ctrl-r and Enter; the kitty protocol keeps them.
const kitty = (app: App) => createMockKeys(app.setup.renderer, { kittyKeyboard: true })

const focus = (app: App) => [app.ctx.getState().chatOpen, app.ctx.getState().focusedPanel]

test("Ctrl-r opens and closes the chat with shift or super held as well", async () => {
  const app = await mounted()
  keysOn(app)
  for (const held of [{}, { shift: true }, { super: true }]) {
    kitty(app).pressKey("r", { ctrl: true, ...held })
    expect(focus(app)).toEqual([true, "chat"])
    kitty(app).pressKey("r", { ctrl: true, ...held })
    expect(focus(app)).toEqual([false, "diff"])
  }
  await app.frame()
})

test("Ctrl-r under the help leaves the chat shut and the help up", async () => {
  const app = await mounted()
  keysOn(app)
  app.show({ showHelp: true })
  ctrl(app, "r")
  expect([app.ctx.getState().chatOpen, app.ctx.getState().showHelp]).toEqual([false, true])
  await app.frame()
})

test("Ctrl-r with a picker open leaves the chat shut", async () => {
  const app = await mounted()
  keysOn(app)
  app.show(openFilePicker(app.ctx.getState()))
  ctrl(app, "r")
  expect(app.ctx.getState().chatOpen).toBe(false)
  await app.frame()
})

test("Ctrl-r cancels a chord the chain holds", async () => {
  const app = await mounted()
  const { chordPending } = keysOn(app)
  app.setup.mockInput.pressKey("g")
  expect(chordPending()).toBe(true)
  ctrl(app, "r")
  expect(chordPending()).toBe(false)
  ctrl(app, "r")
  app.setup.mockInput.pressKey("l")
  expect(app.ctx.getState().showLinePeek).toBe(false)
  await app.frame()
})

test("Enter sends the trimmed text and clears the input; shift-Enter does not send", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  const input = app.chatColumn.input()!
  app.setup.mockInput.pressEnter()
  expect([app.agent.asked, input.plainText]).toEqual([[], ""])
  await app.setup.mockInput.typeText("  what does this do? ")
  kitty(app).pressEnter({ shift: true })
  expect(app.agent.asked).toEqual([])
  app.setup.mockInput.pressEnter()
  expect(app.agent.asked).toEqual(["what does this do?"])
  expect(input.plainText).toBe("")
})

test("a question that does not go keeps its text in the input", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  app.chat.send = () => false
  await app.setup.mockInput.typeText("@nope.ts why")
  app.setup.mockInput.pressEnter()
  expect([app.agent.asked, app.chatColumn.input()!.plainText]).toEqual([[], "@nope.ts why"])
})

test("Ctrl-j breaks the line rather than sending", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("one")
  app.setup.mockInput.pressKey("\n")
  await app.setup.mockInput.typeText("two")
  ctrl(app, "j")
  expect(app.chatColumn.input()!.plainText).toBe("one\ntwo\n")
  expect(app.agent.asked).toEqual([])
})

test("Esc stops an answer while one runs, and otherwise hands the keys back to the diff", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("q")
  app.setup.mockInput.pressEnter()
  await escape(app.setup.mockInput)
  expect([app.agent.interrupts(), focus(app)]).toEqual([1, [true, "chat"]])
  app.agent.events().answerDone({ interrupted: true })
  await escape(app.setup.mockInput)
  expect([app.agent.interrupts(), focus(app), app.chat.status()]).toEqual([1, [true, "diff"], "idle"])
})

test("Ctrl-n twice starts over; a letter in between keeps the conversation", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("q")
  app.setup.mockInput.pressEnter()
  app.agent.answer("a")
  ctrl(app, "n")
  expect(app.chat.clearPrompt()).toBe(NEW_CONVERSATION_PROMPT)
  await app.setup.mockInput.typeText("x")
  expect(app.chat.clearPrompt()).toBeNull()
  ctrl(app, "n")
  ctrl(app, "n")
  expect([app.chat.entries.length, app.agent.closes()]).toEqual([0, 1])
})

test("backspace on an empty input walks left", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  app.setup.mockInput.pressBackspace()
  expect(focus(app)).toEqual([true, "diff"])
})

test("backspace with text ends a pending start-over as it deletes", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("q")
  app.setup.mockInput.pressEnter()
  app.agent.answer("a")
  await app.setup.mockInput.typeText("ab")
  ctrl(app, "n")
  app.setup.mockInput.pressBackspace()
  expect([app.chatColumn.input()!.plainText, app.chat.clearPrompt(), focus(app)]).toEqual(["a", null, [true, "chat"]])
})

test("Ctrl-l in the chat goes nowhere and leaves a pending start-over standing", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("q")
  app.setup.mockInput.pressEnter()
  app.agent.answer("a")
  ctrl(app, "n")
  ctrl(app, "l")
  expect([app.chat.clearPrompt(), focus(app), app.chatColumn.input()!.plainText]).toEqual([
    NEW_CONVERSATION_PROMPT,
    [true, "chat"],
    "",
  ])
})

test("Ctrl-l from the thread panel steps into the open chat", async () => {
  const app = await mounted(160)
  keysOn(app)
  app.show({ ...openInlineCommentOverlay(app.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"), focusedPanel: "diff" })
  openChat(app)
  app.show({ focusedPanel: "comments" })
  ctrl(app, "l")
  expect(focus(app)).toEqual([true, "chat"])
})

test("a key the chat takes drops a pending mark chord", async () => {
  const app = await mounted()
  const { chordPending } = keysOn(app)
  openChat(app)
  app.setup.mockInput.pressBackspace()
  app.setup.mockInput.pressKey("m")
  expect(chordPending()).toBe(true)
  // Focus can reach the chat with the chord pending by a click, which the keys cannot make.
  app.show({ focusedPanel: "chat" })
  await app.setup.mockInput.typeText("a")
  expect(chordPending()).toBe(false)
  expect(app.chatColumn.input()!.plainText).toBe("a")
})

test("with the composer open, Ctrl-r leaves the chat shut", async () => {
  const app = await mounted(160)
  keysOn(app)
  app.show(openInlineCommentOverlay(app.ctx.getState(), "src/greet.ts", 2, "RIGHT", "compose"))
  ctrl(app, "r")
  expect(app.ctx.getState().chatOpen).toBe(false)
  await app.frame()
})

test("with the PR comment input open, the chat's keys stand aside", async () => {
  const app = await mounted()
  keysOn(app)
  openChat(app)
  const state = app.ctx.getState()
  app.show({ prInfoPanel: { ...state.prInfoPanel, commentInputOpen: true } })
  await app.setup.mockInput.typeText("x")
  expect(app.chatColumn.input()!.plainText).toBe("x")
  ctrl(app, "r")
  expect(app.ctx.getState().chatOpen).toBe(true)
})
