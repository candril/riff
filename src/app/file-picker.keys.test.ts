import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { treeRowsOf } from "../components/FileTree"
import { createInitialState } from "../state"
import { adoptReloadedState } from "../features/refresh/handlers"

const fileDiff = (name: string, before: string, after: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-  return "${before}"
+  return "${after}"
`
const DIFF =
  fileDiff("src/greet.ts", "hi", "hello") +
  fileDiff("src/farewell.ts", "bye", "goodbye") +
  fileDiff("src/main.ts", "start", "begin")

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** The picker's rows: every line from its title down, from the title's column on. */
function pickerBox(frame: string): string {
  const lines = frame.split("\n")
  const title = lines.findIndex((line) => line.includes("Find Files"))
  if (title === -1) return ""
  const column = lines[title]!.indexOf("Find Files")
  return lines
    .slice(title)
    .map((line) => line.slice(column))
    .join("\n")
}

test("Ctrl-f opens the picker on its factory, Ctrl-n wraps, a query narrows, Enter jumps and Escape or a reload closes it", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  const mounted = app
  const { files } = mounted.ctx.getState()
  const greet = files.findIndex((file) => file.filename === "src/greet.ts")
  // One file on screen, so the jump swaps it and the diff shows which one landed.
  mounted.show({ selectedFileIndex: greet, files })
  keysOn(mounted, { rebuildLineMapping: () => mounted.show({ files: mounted.ctx.getState().files }) })
  const { mockInput } = mounted.setup

  mockInput.pressKey("f", { ctrl: true })
  expect(mounted.filePicker.open()).toBe(true)
  let rows = pickerBox(await mounted.frame())
  // The count reads the selected row's place out of the rows shown.
  const count = async () => pickerBox(await mounted.frame()).match(/Find Files\s+(\d+\/\d+)/)?.[1]
  expect(rows).toMatch(/Find Files\s+1\/3/)
  for (const file of files) expect(rows).toContain(file.filename)

  mockInput.pressKey("n", { ctrl: true })
  mockInput.pressKey("n", { ctrl: true })
  expect(await count()).toBe("3/3")
  mockInput.pressKey("n", { ctrl: true })
  expect(await count()).toBe("1/3")
  mockInput.pressKey("p", { ctrl: true })
  expect(await count()).toBe("3/3")

  await mockInput.typeText("fare")
  expect(mounted.filePicker.snapshot()).toEqual({ query: "fare", selectedIndex: 0 })
  rows = pickerBox(await mounted.frame())
  expect(rows).toMatch(/Find Files\s+1\/1/)
  expect(rows).toContain("src/farewell.ts")
  expect(rows).not.toContain("src/greet.ts")
  expect(rows).not.toContain("src/main.ts")

  mockInput.pressEnter()
  const jumped = await mounted.frame()
  const state = mounted.ctx.getState()
  expect(mounted.filePicker.open()).toBe(false)
  expect(jumped).not.toContain("Find Files")
  expect(treeRowsOf(state)[state.treeHighlightIndex]?.node.file?.filename).toBe("src/farewell.ts")
  expect(jumped.split("\n")[0]).toContain("src/farewell.ts")
  expect(jumped).toContain(`return "goodbye"`)
  expect(jumped).not.toContain(`return "hello"`)

  mockInput.pressKey("f", { ctrl: true })
  expect(await mounted.frame()).toContain("Find Files")
  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(mounted.filePicker.open()).toBe(false)
  expect(await mounted.frame()).not.toContain("Find Files")

  mockInput.pressKey("f", { ctrl: true })
  await mockInput.typeText("gr")
  expect(await mounted.frame()).toContain("Find Files")
  const { help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker } = mounted
  const reload = { getState: mounted.ctx.getState, setState: mounted.ctx.setState, help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker }
  adoptReloadedState(reload, (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))
  mounted.render()
  expect(mounted.filePicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  expect(mounted.filePicker.open()).toBe(false)
  expect(await mounted.frame()).not.toContain("Find Files")
})
