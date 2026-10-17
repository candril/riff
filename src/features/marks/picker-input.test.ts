import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import { handleMarksPickerInput, type MarksPickerInputContext } from "./picker-input"
import { openMarksPicker, setMarksPickerQuery, moveMarksPickerSelection } from "./picker-state"
import type { Mark } from "./types"

const file = (filename: string): DiffFile => ({ filename, additions: 1, deletions: 0, status: "modified", content: "" })
const mark = (letter: string, filename: string): Mark => ({ letter, filename, line: 1, side: "RIGHT" })

function harness(setup: (s: AppState) => AppState = openMarksPicker) {
  const base = createInitialState([file("src/alpha.ts"), file("src/beta.ts"), file("docs/gamma.md")], [], "", "")
  let state: AppState = setup({
    ...base,
    marks: {
      marks: [mark("a", "src/alpha.ts"), mark("b", "src/beta.ts"), mark("c", "docs/gamma.md")],
      current: "b",
      previous: "a",
    },
  })
  const jumps: string[] = []
  const saved: (readonly Mark[])[] = []
  let prevented = 0

  const press = (name: string, ctrl = false) => {
    const ctx: MarksPickerInputContext = {
      state,
      setState: (fn) => { state = fn(state) },
      render: () => {},
      onJump: (letter) => { jumps.push(letter) },
      save: (marks) => { saved.push(marks) },
    }
    return handleMarksPickerInput({ name, ctrl, preventDefault: () => { prevented++ } }, ctx)
  }

  return { press, jumps, saved, state: () => state, prevented: () => prevented }
}

const letters = (s: AppState) => s.marks.marks.map((m) => m.letter)

describe("the marks picker's keys", () => {
  test("do nothing while it is closed", () => {
    const h = harness((s) => s)
    expect(h.press("return")).toBe(false)
    expect(h.jumps).toEqual([])
  })

  test("Enter jumps to the filtered entry and closes", () => {
    const h = harness((s) => setMarksPickerQuery(openMarksPicker(s), "gamma"))
    expect(h.press("return")).toBe(true)
    expect(h.jumps).toEqual(["c"])
    expect(h.state().marksPicker.open).toBe(false)
  })

  test("Esc closes without jumping", () => {
    const h = harness()
    h.press("escape")
    expect(h.state().marksPicker.open).toBe(false)
    expect(h.jumps).toEqual([])
  })

  test("Ctrl-n, Ctrl-p and the arrows move the selection", () => {
    const h = harness()
    h.press("n", true)
    h.press("down")
    expect(h.state().marksPicker.selectedIndex).toBe(2)
    h.press("p", true)
    h.press("up")
    expect(h.state().marksPicker.selectedIndex).toBe(0)
  })

  test("Ctrl-x deletes the selected mark of the filtered list and stays open", () => {
    const h = harness((s) => setMarksPickerQuery(openMarksPicker(s), "src"))
    h.press("down")
    expect(h.press("x", true)).toBe(true)
    expect(letters(h.state())).toEqual(["a", "c"])
    expect(h.saved).toEqual([h.state().marks.marks])
    expect(h.state().marksPicker.open).toBe(true)
    expect(h.state().marks).toMatchObject({ current: null, previous: "a" })
  })

  test("deleting the last entry moves the selection up to the new last one", () => {
    const h = harness((s) => moveMarksPickerSelection(openMarksPicker(s), 2, 2))
    h.press("x", true)
    expect(letters(h.state())).toEqual(["a", "b"])
    expect(h.state().marksPicker.selectedIndex).toBe(1)
  })

  test("a bare x or j is typing, not a command", () => {
    const h = harness()
    expect(h.press("x")).toBe(true)
    expect(h.press("j")).toBe(true)
    expect(letters(h.state())).toEqual(["a", "b", "c"])
    expect(h.state().marksPicker.selectedIndex).toBe(0)
    expect(h.saved).toEqual([])
    expect(h.prevented()).toBe(0)
  })
})
