import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"

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
  // Settles the resize a key may have queued before the renderer goes away.
  await app?.frame()
  await app?.dispose()
  app = null
})

async function mounted() {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  return { app, keys: keysOn(app) }
}

// The chat comes ahead of every chord, so Ctrl-r reaches the chat
// whatever first key of a chord is waiting.
for (const first of ["z", "]", "["]) {
  test(`${first} then Ctrl-r opens the chat and leaves no chord pending`, async () => {
    const { app, keys } = await mounted()

    app.setup.mockInput.pressKey(first)
    expect(keys.chordPending()).toBe(true)
    ctrl(app, "r")

    const state = app.ctx.getState()
    expect([state.chatOpen, state.focusedPanel]).toEqual([true, "chat"])
    expect(keys.chordPending()).toBe(false)
  })
}

// The global keys decline every key while a chord is pending.
test("z then q does not quit", async () => {
  const { app, keys } = await mounted()

  app.setup.mockInput.pressKey("z")
  app.setup.mockInput.pressKey("q")

  expect(keys.quits).toEqual([])
  expect(keys.chordPending()).toBe(false)
})

test("z then Ctrl-p opens no palette", async () => {
  const { app, keys } = await mounted()

  app.setup.mockInput.pressKey("z")
  ctrl(app, "p")

  expect(app.actionMenu.open()).toBe(false)
  expect(keys.chordPending()).toBe(false)
})

test("] then b leaves the file tree as it was", async () => {
  const { app, keys } = await mounted()
  const before = app.ctx.getState().showFilePanel

  app.setup.mockInput.pressKey("]")
  app.setup.mockInput.pressKey("b")

  expect(app.ctx.getState().showFilePanel).toBe(before)
  expect(keys.chordPending()).toBe(false)
})
