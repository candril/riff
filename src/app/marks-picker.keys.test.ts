import { afterEach, expect, test } from "bun:test"
import { jumpScenario, KEY, type JumpScenario } from "../testing/jump-scenarios"
import { bgAt, ints } from "../testing/frame"
import { createInitialState } from "../state"
import { adoptReloadedState } from "../features/refresh/handlers"
import { theme } from "../theme"

const CTRL_P = "\x10"
const CTRL_X = "\x18"

const scenarios: JumpScenario[] = []
afterEach(async () => {
  await Promise.all(scenarios.splice(0).map((opened) => opened.dispose()))
})

async function marksApp() {
  const opened = await jumpScenario({ height: 30 })
  scenarios.push(opened)
  return opened
}

/** The picker's mark rows as drawn: each row's letter, and which one wears the selection's background. */
function markRows(opened: JumpScenario) {
  const lines = opened.mounted.setup.captureCharFrame().split("\n")
  const spans = opened.mounted.setup.captureSpans()
  const selection = String(ints(theme.surface0))
  return lines.flatMap((line, y) => {
    const match = / ([a-z])  src\/[\w.]+:\d+ /.exec(line)
    if (!match) return []
    return [{ letter: match[1]!, selected: String(bgAt(spans, match.index + 1, y)) === selection }]
  })
}

const letters = (opened: JumpScenario) => markRows(opened).map((row) => row.letter)
const selectedLetter = (opened: JumpScenario) => markRows(opened).find((row) => row.selected)?.letter ?? null

/** The frame's row under the terminal's cursor, whose row the renderer counts from 1. */
function cursorRow(opened: JumpScenario, frame: string) {
  return frame.split("\n")[opened.mounted.setup.renderer.getCursorState().y - 1] ?? ""
}

test("Ctrl-k lists every mark, a query narrows them, Ctrl-n and Ctrl-p stop at the ends, Ctrl-x deletes, Enter jumps and Escape or a reload closes it", async () => {
  const opened = await marksApp()
  const { mounted, press, lineOf, moveTo } = opened
  const { mockInput } = mounted.setup
  const picker = () => ({ open: mounted.marksPicker.open(), ...mounted.marksPicker.snapshot() })

  moveTo(lineOf("src/alpha.ts", "needle 25"))
  press("m", "a")
  moveTo(lineOf("src/alpha.ts", "needle 5"))
  press("m", "b")
  moveTo(lineOf("src/alpha.ts", "line 22"))
  press("m", "c")
  moveTo(0)
  mounted.render()

  press(KEY.ctrlK)
  let frame = await mounted.frame()
  expect(picker().open).toBe(true)
  expect(frame).toContain("Marks")
  expect(frame).toContain("1/3")
  expect(letters(opened)).toEqual(["a", "b", "c"])
  expect(selectedLetter(opened)).toBe("a")

  await mockInput.typeText("needle")
  frame = await mounted.frame()
  expect(frame).toContain("1/2")
  expect(letters(opened)).toEqual(["a", "b"])
  expect(selectedLetter(opened)).toBe("a")

  press(CTRL_P)
  await mounted.frame()
  expect(selectedLetter(opened)).toBe("a")
  press(KEY.ctrlN)
  await mounted.frame()
  expect(selectedLetter(opened)).toBe("b")
  press(KEY.ctrlN)
  frame = await mounted.frame()
  expect(selectedLetter(opened)).toBe("b")
  expect(frame).toContain("2/2")
  expect(picker().selectedIndex).toBe(1)

  press(CTRL_X)
  frame = await mounted.frame()
  expect(letters(opened)).toEqual(["a"])
  expect(selectedLetter(opened)).toBe("a")
  expect(frame).toContain("1/1")
  expect(mounted.ctx.getState().marks.marks.map((mark) => mark.letter)).toEqual(["a", "c"])

  press(KEY.enter)
  frame = await mounted.frame()
  expect(picker().open).toBe(false)
  expect(frame).not.toContain("^x delete")
  expect(cursorRow(opened, frame)).toContain('const v25 = "src/alpha.ts needle 25"')

  press(KEY.ctrlK)
  await mounted.frame()
  expect(letters(opened)).toEqual(["a", "c"])
  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(picker().open).toBe(false)
  expect(await mounted.frame()).not.toContain("^x delete")

  press(KEY.ctrlK)
  await mockInput.typeText("line")
  await mounted.frame()
  expect(letters(opened)).toEqual(["c"])
  const { ctx: render, help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu } = mounted
  const reload = { getState: render.getState, setState: render.setState, help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu }
  adoptReloadedState(reload, (prev) => ({ ...createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"), marks: prev.marks }))
  mounted.render()
  expect(picker()).toEqual({ open: false, query: "", selectedIndex: 0 })
  expect(await mounted.frame()).not.toContain("^x delete")
})

test("Ctrl-k with no marks says how to set one", async () => {
  const opened = await marksApp()
  opened.press(KEY.ctrlK)
  const frame = await opened.mounted.frame()
  expect(frame).toContain("Marks")
  expect(frame).toContain("No marks — m{letter} sets one")
})
