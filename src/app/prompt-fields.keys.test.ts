import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { executeAction, type ActionHandlers } from "../features/action-menu/execute"
import { SearchHandler } from "../vim-diff/search-handler"

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

/** Wired for the palette, the file picker and search: the palette's actions run for real, their handlers throw. */
function keysFor(mounted: NonNullable<typeof app>) {
  const { ctx: render } = mounted
  const handlers = new Proxy({} as ActionHandlers, {
    get(_, name) {
      return () => {
        throw new Error(`the palette ran handlers.${String(name)}`)
      }
    },
  })
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
  return keysOn(mounted, {
    getSearchState: render.getSearchState,
    searchHandler,
    executeAction: (id) =>
      void executeAction(id, { state: render.getState(), setState: render.setState, render: mounted.render, handlers }),
  })
}

test("the palette's Enter opens the file picker on a fresh field of its own, and search after it on another", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  keysFor(app)
  const { mockInput } = app.setup

  mockInput.pressKey("p", { ctrl: true })
  await mockInput.typeText("find files")
  expect(app.ctx.getState().actionMenu.query).toBe("find files")
  expect(await app.frame()).toContain("find files")

  mockInput.pressEnter()
  expect(app.ctx.getState().actionMenu.open).toBe(false)
  expect(app.ctx.getState().filePicker.open).toBe(true)
  await mockInput.typeText("greet")
  expect(app.ctx.getState().filePicker.query).toBe("greet")
  const picker = (await app.frame()).split("\n")
  const fieldRow = picker.find((line) => line.includes("greet") && !line.includes("src/"))
  expect(fieldRow).toBeDefined()
  expect(fieldRow).not.toContain("find files")
  expect(picker.join("\n")).not.toContain("find files")

  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(app.ctx.getState().filePicker.open).toBe(false)
  await mockInput.typeText("/")
  expect(app.ctx.getSearchState().active).toBe(true)
  const search = (await app.frame()).split("\n")
  const prompt = search.find((line) => line.trimStart().startsWith("/"))
  expect(prompt?.trim()).toBe("/")
  expect(search.join("\n")).not.toContain("find files")
  await mockInput.typeText("he")
  expect((await app.frame()).split("\n").find((line) => line.trimStart().startsWith("/"))?.trim()).toBe("/he")
})
