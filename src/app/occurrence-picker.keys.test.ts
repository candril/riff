import { test, expect, afterEach } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import { createInitialState } from "../state"
import { adoptReloadedState } from "../features/refresh/handlers"
import { bgAt, ints } from "../testing/frame"
import { theme } from "../theme"

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

/**
 * The picker's rows from its title's column on: the title, the prompt and the
 * hits down to the blank line under them, past which the diff shows through.
 */
function pickerBox(frame: string): string {
  const lines = frame.split("\n")
  const title = lines.findIndex((line) => line.includes("Occurrences"))
  if (title === -1) return ""
  const column = lines[title]!.indexOf("Occurrences")
  const box = lines.slice(title).map((line) => line.slice(column))
  const end = box.findIndex((line, i) => i > 2 && line.trim() === "")
  return box.slice(0, end === -1 ? undefined : end).join("\n")
}

/** The prompt's line, two below the title. */
const promptLine = (rows: string) => rows.split("\n")[2]?.trim()

/** The hit row under the prompt that wears the selection's background, as drawn. */
function selectedHit(mounted: NonNullable<typeof app>): string | null {
  const lines = mounted.setup.captureCharFrame().split("\n")
  const title = lines.findIndex((line) => line.includes("Occurrences"))
  const column = lines[title]!.indexOf("Occurrences")
  const spans = mounted.setup.captureSpans()
  const selection = String(ints(theme.surface0))
  const y = lines.findIndex((_line, y) => y > title + 2 && String(bgAt(spans, column, y)) === selection)
  return y === -1 ? null : lines[y]!.slice(column).trim()
}

/** The frame's row under the terminal's cursor, whose row the renderer counts from 1. */
function cursorRow(mounted: NonNullable<typeof app>, frame: string): string {
  return frame.split("\n")[mounted.setup.renderer.getCursorState().y - 1] ?? ""
}

test("Ctrl-s opens the picker on its factory seeded with the word under the cursor, Ctrl-g narrows, Ctrl-n wraps, Enter jumps and Escape or a reload closes it", async () => {
  app = await mountApp(DIFF, { width: 110, height: 30 })
  const mounted = app
  const { ctx: render } = mounted
  mounted.show({ focusedPanel: "diff" })
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const fileNavContext = {
    getState: render.getState,
    setState: render.setState,
    createLineMapping: rebuildLineMapping,
  } as unknown as AppKeyContext["fileNavContext"]
  const keys = keysOn(mounted, { rebuildLineMapping, fileNavContext })
  const { mockInput } = mounted.setup
  const lineOf = (content: string) => render.getLineMapping().allLines.findIndex((line) => line.content === content)
  const picker = () => ({ open: mounted.occurrencePicker.open(), ...mounted.occurrencePicker.snapshot() })

  keys.setVim({ line: lineOf('  return "goodbye"'), col: 2 })
  ctrl(mounted, "s")
  expect(picker().open).toBe(true)
  let rows = pickerBox(await mounted.frame())
  expect(promptLine(rows)).toBe("return")
  expect(rows).toContain("4 in 2 files")
  expect(rows).toContain("src/greet.ts")
  expect(rows).toContain("src/farewell.ts")

  ctrl(mounted, "g")
  rows = pickerBox(await mounted.frame())
  expect(picker().narrowing).toBe(true)
  expect(rows).toContain("return ›")
  expect(rows).toContain("^g search")
  expect(promptLine(rows)).toBe("Narrow by path or text, !term to drop…")
  await mockInput.typeText("farewell")
  rows = pickerBox(await mounted.frame())
  expect(picker()).toMatchObject({ query: "return", filter: "farewell", narrowing: true })
  expect(promptLine(rows)).toBe("farewell")
  expect(rows).toContain("2 in 1 file")
  expect(rows).toContain("src/farewell.ts")
  expect(rows).not.toContain("src/greet.ts")

  ctrl(mounted, "g")
  rows = pickerBox(await mounted.frame())
  expect(rows).toContain("^g narrow")
  expect(rows).not.toContain("return ›")
  expect(promptLine(rows)).toBe("return")
  await mockInput.typeText(' "g')
  rows = pickerBox(await mounted.frame())
  expect(picker()).toMatchObject({ query: 'return "g', filter: "farewell", selectedIndex: 0 })
  expect(promptLine(rows)).toBe('return "g')
  expect(rows).toContain("1 in 1 file")
  expect(rows).toContain('return "goodbye"')
  expect(rows).not.toContain('return "bye"')

  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(picker().open).toBe(false)
  expect(await mounted.frame()).not.toContain("Occurrences")

  ctrl(mounted, "s")
  rows = pickerBox(await mounted.frame())
  expect(rows).toContain("4 in 2 files")
  expect(selectedHit(mounted)).toBe('2 - return "hi"')
  const steps: [number, string][] = [
    [1, '2 + return "hello"'],
    [2, '2 - return "bye"'],
    [3, '2 + return "goodbye"'],
    [0, '2 - return "hi"'],
  ]
  for (const [index, hit] of steps) {
    ctrl(mounted, "n")
    expect(picker().selectedIndex).toBe(index)
    await mounted.frame()
    expect(selectedHit(mounted)).toBe(hit)
  }
  mockInput.pressEnter()
  const jumped = await mounted.frame()
  expect(picker().open).toBe(false)
  expect(jumped).not.toContain("Occurrences")
  expect(cursorRow(mounted, jumped)).toContain('return "hi"')
  expect(render.getLineMapping().getLine(keys.vimState().line)).toMatchObject({
    filename: "src/greet.ts",
    type: "deletion",
    content: '  return "hi"',
  })
  expect(keys.vimState().col).toBe(2)

  ctrl(mounted, "s")
  await mockInput.typeText(' "h')
  expect(pickerBox(await mounted.frame())).toContain("2 in 1 file")
  const { help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu } = mounted
  const reload = { getState: render.getState, setState: render.setState, help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu }
  adoptReloadedState(reload, (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))
  mounted.render()
  expect(picker()).toMatchObject({ open: false, query: "", filter: "", narrowing: false, selectedIndex: 0 })
  expect(await mounted.frame()).not.toContain("Occurrences")
})
