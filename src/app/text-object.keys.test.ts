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

const BRACKETED = `diff --git a/src/list.ts b/src/list.ts
index 1111111..2222222 100644
--- a/src/list.ts
+++ b/src/list.ts
@@ -1,1 +1,1 @@
-export const list = [1]
+export const list = [1, 2]
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

async function diffApp(diff = DIFF) {
  app = await mountApp(diff, { width: 100, height: 30 })
  app.show()
  const mounted = app
  const keys = keysOn(mounted)
  await mounted.frame()
  return { mounted, ...keys }
}

test("vif selects the file's lines whichever dispatcher feeds it, the file picker staying shut", async () => {
  const { mounted, vimState } = await diffApp()
  await mounted.setup.mockInput.typeText("vif")
  expect(vimState().pendingTextObject).toBeNull()
  expect(vimState().mode).toBe("visual-line")
  expect(vimState().selectionAnchor).toBeLessThan(vimState().line)
  expect(mounted.filePicker.open()).toBe(false)
})

test("vi{ clears the pending object and opens nothing, whichever dispatcher feeds it", async () => {
  const { mounted, vimState } = await diffApp()
  const before = mounted.ctx.getState()
  await mounted.setup.mockInput.typeText("vi{")
  expect(vimState().pendingTextObject).toBeNull()
  expect(mounted.ctx.getState()).toEqual(before)
})

test("vi[ selects inside the brackets, the capture keeping [ from opening its chords", async () => {
  const { mounted, vimState, jumpTo, setVim, chordPending } = await diffApp(BRACKETED)
  const content = "export const list = [1, 2]"
  jumpTo(mounted.ctx.getLineMapping().allLines.findIndex((line) => line.content === content))
  setVim({ col: content.indexOf("1") })
  await mounted.setup.mockInput.typeText("vi[")
  expect(chordPending()).toBe(false)
  expect(vimState().pendingTextObject).toBeNull()
  expect(vimState().mode).toBe("visual")
  expect(vimState().selectionAnchorCol).toBe(content.indexOf("1"))
  expect(vimState().col).toBe(content.indexOf("2"))
})

test("with a text object pending, Ctrl-r still opens the chat", async () => {
  const { mounted, vimState } = await diffApp()
  await mounted.setup.mockInput.typeText("vi")
  expect(vimState().pendingTextObject).not.toBeNull()
  ctrl(mounted, "r")
  expect(mounted.ctx.getState().chatOpen).toBe(true)
})

test("with the line peek up, a pending text object takes its key past the peek", async () => {
  const { mounted, vimState, setVim } = await diffApp()
  await mounted.setup.mockInput.typeText("glv")
  expect(mounted.linePeek.open()).toBe(true)
  expect(vimState().mode).toBe("normal")
  setVim({ mode: "visual", selectionAnchor: vimState().line, pendingTextObject: { scope: "i" } })
  await mounted.setup.mockInput.typeText("f")
  expect(vimState().pendingTextObject).toBeNull()
  expect(vimState().mode).toBe("visual-line")
  expect(mounted.linePeek.open()).toBe(true)
})
