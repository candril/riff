import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn, moveTo, openChat } from "../testing/chat-keys"

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

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

const lineWith = (frame: string, text: string) => frame.split("\n").findIndex((line) => line.includes(text))

test("in visual mode Ctrl-r puts @selection in the input, and every selected line goes to the agent", async () => {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show()
  const { vimState } = keysOn(app)
  moveTo(app, vimState, "  const b = 2")
  app.setup.mockInput.pressKey("V")
  app.setup.mockInput.pressKey("j")
  app.setup.mockInput.pressKey("j")

  ctrl(app, "r")
  const input = app.ctx.chatColumn.input()!
  expect(input.plainText).toBe("@selection ")
  expect(input.cursorOffset).toBe("@selection ".length)
  // Focus moving to the chat leaves the diff's selection where it was, so the send still reads it.
  expect(vimState()).toMatchObject({ mode: "visual-line" })
  expect(await app.frame()).toContain("@selection")

  await app.setup.mockInput.typeText("why three?")
  app.setup.mockInput.pressEnter()

  expect(app.agent.asked).toEqual(["@selection why three?"])
  const received = app.agent.received[0]!
  expect(received.startsWith("[Reviewer's position: src/sum.ts:2-4 (new side)]")).toBe(true)
  expect(received).toContain(
    [
      "[@selection: src/sum.ts:2-4 (new side)]",
      "@@ -1,2 +1,5 @@",
      "          2 +  const b = 2",
      "          3 +  const c = 3",
      "          4 +  const d = 4",
    ].join("\n"),
  )
  expect(received.endsWith("\n\n@selection why three?")).toBe(true)

  const frame = await app.frame()
  const question = lineWith(frame, "› @selection why three?")
  expect(question).toBeGreaterThan(0)
  expect(frame.split("\n")[question - 1]).toContain("src/sum.ts:2-4  @selection sum.ts:2-4")
})

test("in normal mode Ctrl-r puts @file in the input, and the file's diff goes along", async () => {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show()
  const { vimState } = keysOn(app)
  moveTo(app, vimState, "  const c = 3")

  ctrl(app, "r")
  expect(app.ctx.chatColumn.input()!.plainText).toBe("@file ")
  await app.setup.mockInput.typeText("what is this?")
  app.setup.mockInput.pressEnter()

  expect(app.agent.attachments[0]![0]!.split("\n", 2)).toEqual(["[@file: the diff of src/sum.ts]", "@@ -1,2 +1,5 @@"])
  const frame = await app.frame()
  expect(frame.split("\n")[lineWith(frame, "› @file what is this?") - 1]).toContain("src/sum.ts:3  @file src/sum.ts")
})

test("Ctrl-r does not add a token the input already holds", async () => {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show()
  keysOn(app)
  ctrl(app, "r")
  app.setup.mockInput.pressEscape()
  await Bun.sleep(50)
  expect(app.ctx.getState().focusedPanel).toBe("diff")
  ctrl(app, "r")
  expect(app.ctx.chatColumn.input()!.plainText).toBe("@file ")
})

test("a path that is no changed file shows an error, sends nothing and keeps the text", async () => {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("@nope/missing.ts why")
  app.setup.mockInput.pressEnter()

  expect(app.agent.asked).toEqual([])
  expect(app.ctx.chatColumn.input()!.plainText).toBe("@nope/missing.ts why")
  expect((await app.frame()).replace(/\s+/g, " ")).toContain("@nope/missing.ts is not a file of this change")
})

test("@pr in a local review shows its error", async () => {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("@pr summary")
  app.setup.mockInput.pressEnter()

  expect(app.agent.asked).toEqual([])
  expect(await app.frame()).toContain("@pr needs a pull request review.")
})

test("Ctrl-r from the chat closes it and puts nothing in the input", async () => {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show()
  keysOn(app)
  openChat(app)
  await app.setup.mockInput.typeText("draft")
  ctrl(app, "r")
  expect([app.ctx.getState().chatOpen, app.ctx.chatColumn.input()!.plainText]).toEqual([false, "draft"])
  // The diff widens again on the next frame; let it land before the app is torn down.
  await app.frame()
})

test("Ctrl-r from the file tree opens the chat with nothing in the input", async () => {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show({ focusedPanel: "tree" })
  keysOn(app)
  ctrl(app, "r")
  expect([app.ctx.getState().focusedPanel, app.ctx.chatColumn.input()!.plainText]).toEqual(["chat", ""])
})

test("labels too long for the column are cut on their one line, not wrapped", async () => {
  app = await mountApp(THREE_ADDED, { width: 120, height: 24 })
  app.show()
  const { vimState } = keysOn(app)
  moveTo(app, vimState, "  const b = 2")
  app.setup.mockInput.pressKey("V")
  app.setup.mockInput.pressKey("j")
  ctrl(app, "r")
  await app.setup.mockInput.typeText("@file both")
  app.setup.mockInput.pressEnter()

  expect(app.agent.attachments[0]).toHaveLength(2)
  const lines = (await app.frame()).split("\n")
  const question = lines.findIndex((line) => line.includes("› @selection @file both"))
  expect(lines[question - 1]).toContain("src/sum.ts:2-3  @selection sum.ts:2-3  @file")
  expect(lines[question - 1]).not.toContain("@file src/sum.ts")
  expect(lines.filter((line) => /\bsum\.ts\s*$/.test(line))).toEqual([])
})
