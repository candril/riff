import { test, expect, afterEach } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { createComment } from "../types"
import { createInitialState } from "../state"
import { adoptReloadedState } from "../features/refresh/handlers"

const fileDiff = (name: string, before: string, after: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,3 +1,3 @@
 export function run() {
-  return "${before}"
+  return "${after}"
 }
`
const DIFF = fileDiff("src/greet.ts", "hi", "hello") + fileDiff("src/farewell.ts", "bye", "goodbye")

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** The picker's rows: every line from its title down, from the title's column on. */
function pickerBox(frame: string): string {
  const lines = frame.split("\n")
  const title = lines.findIndex((line) => line.includes("Find Comments"))
  if (title === -1) return ""
  const column = lines[title]!.indexOf("Find Comments")
  return lines
    .slice(title)
    .map((line) => line.slice(column))
    .join("\n")
}

test("gC opens the picker on its factory, Ctrl-n wraps, a query narrows, Enter jumps and Escape or a reload closes it", async () => {
  app = await mountApp(DIFF, { width: 110, height: 30 })
  const mounted = app
  const { ctx: render } = mounted
  mounted.show({
    focusedPanel: "diff",
    comments: [createComment("src/greet.ts", 2, "rename the greeting"), createComment("src/farewell.ts", 2, "needs a test")],
  })
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const fileNavContext = {
    getState: render.getState,
    setState: render.setState,
    createLineMapping: rebuildLineMapping,
  } as unknown as AppKeyContext["fileNavContext"]
  const keys = keysOn(mounted, { rebuildLineMapping, fileNavContext })
  const { mockInput } = mounted.setup

  await mockInput.typeText("gC")
  expect(mounted.commentsPicker.open()).toBe(true)
  let rows = pickerBox(await mounted.frame())
  // The count reads the selected row's place out of the rows shown.
  const count = async () => pickerBox(await mounted.frame()).match(/Find Comments\s+(\d+\/\d+)/)?.[1]
  expect(rows).toMatch(/Find Comments\s+1\/2/)
  expect(rows).toContain("src/greet.ts:2")
  expect(rows).toContain("rename the greeting")
  expect(rows).toContain("src/farewell.ts:2")
  expect(rows).toContain("needs a test")

  mockInput.pressKey("n", { ctrl: true })
  expect(await count()).toBe("2/2")
  mockInput.pressKey("n", { ctrl: true })
  expect(await count()).toBe("1/2")
  mockInput.pressKey("p", { ctrl: true })
  expect(await count()).toBe("2/2")

  await mockInput.typeText("test")
  expect(mounted.commentsPicker.snapshot()).toEqual({ query: "test", selectedIndex: 0 })
  rows = pickerBox(await mounted.frame())
  expect(rows).toMatch(/Find Comments\s+1\/1/)
  expect(rows).toContain("needs a test")
  expect(rows).not.toContain("rename the greeting")

  mockInput.pressEnter()
  const jumped = await mounted.frame()
  const state = render.getState()
  expect(mounted.commentsPicker.open()).toBe(false)
  expect(jumped).not.toContain("Find Comments")
  expect(render.getLineMapping().getLine(keys.vimState().line)).toMatchObject({ filename: "src/farewell.ts" })
  expect(state.inlineCommentOverlay).toMatchObject({ open: true, filename: "src/farewell.ts", line: 2 })
  expect(jumped).toContain("needs a test")

  mounted.show({ inlineCommentOverlay: { ...render.getState().inlineCommentOverlay, open: false }, focusedPanel: "diff" })
  await mockInput.typeText("gC")
  expect(await mounted.frame()).toContain("Find Comments")
  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(mounted.commentsPicker.open()).toBe(false)
  expect(await mounted.frame()).not.toContain("Find Comments")

  await mockInput.typeText("gC")
  await mockInput.typeText("na")
  expect(await mounted.frame()).toContain("Find Comments")
  const { help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu } = mounted
  const reload = { getState: render.getState, setState: render.setState, help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu }
  adoptReloadedState(reload, (prev) => ({ ...createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"), comments: prev.comments }))
  mounted.render()
  expect(mounted.commentsPicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  expect(mounted.commentsPicker.open()).toBe(false)
  expect(await mounted.frame()).not.toContain("Find Comments")
})
