import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn, openChat } from "../testing/chat-keys"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
diff --git a/src/sum.ts b/src/sum.ts
index 1111111..2222222 100644
--- a/src/sum.ts
+++ b/src/sum.ts
@@ -1,2 +1,3 @@
 export function sum() {
+  const b = 2
   return 1
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

async function chatWithPicker() {
  app = await mountApp(DIFF, { width: 140, height: 30 })
  app.show()
  keysOn(app)
  openChat(app)
  const input = app.chatColumn.input()!
  const picker = app.chatColumn.atPicker
  const shown = () => picker.candidates().map((c) => c.text)
  return { app, input, picker, shown }
}

// A lone ESC byte is held back a moment, in case it starts an escape sequence.
async function escape(mounted: NonNullable<typeof app>) {
  mounted.setup.mockInput.pressEscape()
  await Bun.sleep(50)
}

test("@ opens the picker on what a question can attach, @selection first", async () => {
  const { app, shown } = await chatWithPicker()
  await app.setup.mockInput.typeText("@")
  expect(shown()).toEqual(["@selection", "@file", "@src/greet.ts", "@src/sum.ts"])
  const frame = await app.frame()
  expect(frame).toContain("@attach")
  expect(frame).toContain("▸ @selection")
  expect(frame).toMatch(/@src\/sum\.ts +M {2}\+1 -0/)
})

test("letters after the @ narrow the list to the file they match", async () => {
  const { app, shown } = await chatWithPicker()
  await app.setup.mockInput.typeText("@gre")
  expect(shown()).toEqual(["@src/greet.ts"])
})

test("Tab inserts the path with a space after it and closes the picker", async () => {
  const { app, input, picker } = await chatWithPicker()
  await app.setup.mockInput.typeText("why @gre")
  app.setup.mockInput.pressTab()
  expect(input.plainText).toBe("why @src/greet.ts ")
  expect(input.cursorOffset).toBe(input.plainText.length)
  expect(picker.session()).toBeNull()
  expect(await app.frame()).not.toContain("@attach")
})

test("Down then Enter inserts the second row, and nothing is sent", async () => {
  const { app, input, picker } = await chatWithPicker()
  await app.setup.mockInput.typeText("@")
  app.setup.mockInput.pressArrow("down")
  app.setup.mockInput.pressEnter()
  expect(input.plainText).toBe("@file ")
  expect(app.agent.asked).toEqual([])
  expect(picker.session()).toBeNull()
})

test("Esc closes the picker, keeps what was typed, and leaves the chat its keys", async () => {
  const { app, input, picker } = await chatWithPicker()
  await app.setup.mockInput.typeText("@gre")
  await escape(app)
  expect(picker.session()).toBeNull()
  expect(input.plainText).toBe("@gre")
  expect(app.ctx.getState().focusedPanel).toBe("chat")
  expect(await app.frame()).not.toContain("@attach")
})

test("Enter with nothing matched sends the question as it stands", async () => {
  const { app, input } = await chatWithPicker()
  await app.setup.mockInput.typeText("@zzz")
  app.setup.mockInput.pressEnter()
  expect(app.agent.asked).toEqual(["@zzz"])
  expect(input.plainText).toBe("")
})

test("Ctrl-n with the picker open moves the selection rather than asking to start over", async () => {
  const { app, picker } = await chatWithPicker()
  await app.setup.mockInput.typeText("@")
  ctrl(app, "n")
  expect(picker.session()).toMatchObject({ selectedIndex: 1 })
  expect(app.chat.clearPrompt()).toBeNull()
  ctrl(app, "p")
  expect(picker.session()).toMatchObject({ selectedIndex: 0 })
})

test("a picker key declines a pending start over", async () => {
  const { app } = await chatWithPicker()
  ctrl(app, "n")
  expect(app.chat.clearPrompt()).not.toBeNull()
  await app.setup.mockInput.typeText("@")
  app.setup.mockInput.pressArrow("down")
  expect(app.chat.clearPrompt()).toBeNull()
})
