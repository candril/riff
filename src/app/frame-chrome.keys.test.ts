import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn, moveTo } from "../testing/chat-keys"
import { SearchHandler } from "../vim-diff/search-handler"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,4 +1,4 @@
 export function greet() {
-  return "hi"
+  return "hello, and a greeting long enough that its line runs past the diff's window by a good way"
 }
diff --git a/src/farewell.ts b/src/farewell.ts
index 3333333..4444444 100644
--- a/src/farewell.ts
+++ b/src/farewell.ts
@@ -1,1 +1,1 @@
-  return "bye"
+  return "goodbye"
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** The status bar's row, the last one drawn. */
const statusRow = (frame: string) => frame.split("\n").at(-1) ?? ""

/** Wired for the file picker and search, besides the chat and the motions keysOn wires. */
function keysFor(mounted: NonNullable<typeof app>) {
  const { ctx: render } = mounted
  const searchHandler = new SearchHandler({
    getMapping: render.getLineMapping,
    getSearchState: render.getSearchState,
    setSearchState: mounted.setSearchState,
    getCursor: render.getVimState,
    setCursor: () => {},
    getFileContent: () => null,
    loadFileContent: async () => {},
    expandDividerForLine: () => {},
    getCollapsedFiles: () => [],
    expandFiles: () => {},
    onUpdate: mounted.render,
  })
  mounted.onSearchPattern((value) => searchHandler.updatePattern(value))
  return keysOn(mounted, { getSearchState: render.getSearchState, searchHandler })
}

// The readout is read off the views each pass draws, so the pass a key renders carries it.
test("the status bar draws the column after a motion, the selection after v j and the matches after a search", async () => {
  app = await mountApp(DIFF, { width: 100, height: 20 })
  app.show()
  const { vimState } = keysFor(app)
  const { mockInput } = app.setup
  await app.frame()
  expect(statusRow(await app.frame())).not.toContain("col ")

  moveTo(app, vimState, `  return "hello, and a greeting long enough that its line runs past the diff's window by a good way"`)
  await mockInput.typeText("$")
  expect(statusRow(await app.frame())).toMatch(/col 100\/100$/)

  await mockInput.typeText("vj")
  expect(statusRow(await app.frame())).toContain("-- VISUAL --  2 lines")

  mockInput.pressEscape()
  await Bun.sleep(50)
  expect(statusRow(await app.frame())).not.toContain("VISUAL")

  await mockInput.typeText("/return")
  mockInput.pressEnter()
  expect(app.ctx.getSearchState().pattern).toBe("return")
  expect(statusRow(await app.frame())).toMatch(/\s3\/4$/)
})

// No key opens a picker while the chat has the keys, so the picker comes from state, as an async open would.
test("Ctrl-r gives the chat's input the keys and the cursor, a picker takes them and closing it gives them back", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  app.show()
  keysFor(app)
  const { renderer } = app.setup
  const cursorInChat = () => renderer.getCursorState().visible && renderer.getCursorState().x > app!.chatColumn.host.x

  ctrl(app, "r")
  const input = app.chatColumn.input()!
  expect(app.ctx.getState().focusedPanel).toBe("chat")
  expect(renderer.currentFocusedRenderable).toBe(input)
  expect((await app.frame()).replace(/\s+/g, " ")).toContain("Ask about this review.")
  expect(cursorInChat()).toBe(true)

  app.show({ filePicker: { ...app.ctx.getState().filePicker, open: true } })
  expect(input.focused).toBe(false)
  expect(renderer.currentFocusedRenderable).toBe(app.islands.filePicker.field())
  expect(await app.frame()).toContain("Find Files")

  app.show({ filePicker: { ...app.ctx.getState().filePicker, open: false } })
  expect(renderer.currentFocusedRenderable).toBe(input)
  expect(await app.frame()).not.toContain("Find Files")
  expect(cursorInChat()).toBe(true)
})
