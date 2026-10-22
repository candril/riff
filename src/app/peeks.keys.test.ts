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
  await app?.dispose()
  app = null
})

async function peekApp() {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const mounted = app
  const keys = keysOn(mounted)
  await mounted.frame()
  return { mounted, ...keys }
}

test("gl opens the line peek over the diff and gl closes it again", async () => {
  const { mounted, jumpTo } = await peekApp()
  jumpTo(mounted.ctx.getLineMapping().allLines.findIndex((line) => line.content === '  return "hello"'))
  const before = await mounted.frame()
  expect(before).not.toContain("line 2")

  await mounted.setup.mockInput.typeText("gl")
  expect(mounted.linePeek.open()).toBe(true)
  expect(await mounted.frame()).toContain("line 2")

  await mounted.setup.mockInput.typeText("gl")
  expect(mounted.linePeek.open()).toBe(false)
  expect(await mounted.frame()).toBe(before)
})

test("with the line peek up, Ctrl-r still opens the chat", async () => {
  const { mounted } = await peekApp()
  await mounted.setup.mockInput.typeText("gl")
  ctrl(mounted, "r")
  expect(mounted.ctx.getState().chatOpen).toBe(true)
  expect(mounted.ctx.getState().focusedPanel).toBe("chat")
})

test("with the line peek up, j scrolls the peek and Esc closes it, the cursor staying put", async () => {
  const { mounted, vimState } = await peekApp()
  const before = vimState().line
  await mounted.setup.mockInput.typeText("glj")
  expect(mounted.linePeek.scroll()).toEqual({ row: 1, col: 0 })
  mounted.setup.mockInput.pressEscape()
  await Bun.sleep(50)
  expect(mounted.linePeek.open()).toBe(false)
  expect(vimState().line).toBe(before)
})

test("the line peek's state lives in its factory: gl opens it, j scrolls it, Tab swaps its side and Esc closes it", async () => {
  const { mounted, jumpTo } = await peekApp()
  jumpTo(mounted.ctx.getLineMapping().allLines.findIndex((line) => line.content === '  return "hello"'))
  const before = await mounted.frame()
  expect(before).not.toContain("line 2")

  await mounted.setup.mockInput.typeText("gl")
  expect(mounted.linePeek.open()).toBe(true)
  expect(mounted.linePeek.snapshot()).toEqual({ side: "new", scroll: { row: 0, col: 0 } })
  expect(await mounted.frame()).toContain("line 2")

  await mounted.setup.mockInput.typeText("j")
  expect(mounted.linePeek.scroll()).toEqual({ row: 1, col: 0 })
  expect(await mounted.frame()).toContain("line 2")

  mounted.setup.mockInput.pressTab()
  await Bun.sleep(50)
  expect(mounted.linePeek.snapshot()).toEqual({ side: "old", scroll: { row: 0, col: 0 } })
  expect(await mounted.frame()).toContain("line 2")

  mounted.setup.mockInput.pressEscape()
  await Bun.sleep(50)
  expect(mounted.linePeek.open()).toBe(false)
  expect(await mounted.frame()).toBe(before)
})
