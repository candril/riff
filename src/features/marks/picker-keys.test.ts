import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import { keymapHarness } from "../../testing/keymap-keys"
import { registerMarksPickerKeys } from "./picker-keys"
import { openMarksPicker, setMarksPickerQuery, moveMarksPickerSelection } from "./picker-state"
import type { Mark } from "./types"

const file = (filename: string): DiffFile => ({ filename, additions: 1, deletions: 0, status: "modified", content: "" })
const mark = (letter: string, filename: string): Mark => ({ letter, filename, line: 1, side: "RIGHT" })

const CTRL = { n: "\x0e", p: "\x10", x: "\x18" } as const
const NAMED: Record<string, string> = { return: "\r", escape: "\x1b", up: "\x1b[A", down: "\x1b[B" }

async function harness(setup: (s: AppState) => AppState = openMarksPicker) {
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
  const { riffKeymap, leftKeys, press: pressSequence } = await keymapHarness()
  registerMarksPickerKeys(riffKeymap, {
    getState: () => state,
    setState: (fn) => {
      state = fn(state)
    },
    render: () => {},
    onJump: (letter) => {
      jumps.push(letter)
    },
    save: (marks) => {
      saved.push(marks)
    },
  })

  let prevented = 0
  /** True when the picker kept the key from the chain. */
  const press = (name: string, ctrl = false) => {
    const before = leftKeys.length
    const key = pressSequence(ctrl ? CTRL[name as keyof typeof CTRL] : (NAMED[name] ?? name))
    if (key.defaultPrevented) prevented++
    return leftKeys.length === before
  }

  return { press, jumps, saved, state: () => state, prevented: () => prevented }
}

const letters = (s: AppState) => s.marks.marks.map((m) => m.letter)

describe("the marks picker's keys", () => {
  test("do nothing while it is closed", async () => {
    const h = await harness((s) => s)
    expect(h.press("return")).toBe(false)
    expect(h.jumps).toEqual([])
  })

  test("Enter jumps to the filtered entry and closes", async () => {
    const h = await harness((s) => setMarksPickerQuery(openMarksPicker(s), "gamma"))
    expect(h.press("return")).toBe(true)
    expect(h.jumps).toEqual(["c"])
    expect(h.state().marksPicker.open).toBe(false)
  })

  test("Esc closes without jumping", async () => {
    const h = await harness()
    h.press("escape")
    expect(h.state().marksPicker.open).toBe(false)
    expect(h.jumps).toEqual([])
  })

  test("Ctrl-n, Ctrl-p and the arrows move the selection", async () => {
    const h = await harness()
    h.press("n", true)
    h.press("down")
    expect(h.state().marksPicker.selectedIndex).toBe(2)
    h.press("p", true)
    h.press("up")
    expect(h.state().marksPicker.selectedIndex).toBe(0)
  })

  test("Ctrl-x deletes the selected mark of the filtered list and stays open", async () => {
    const h = await harness((s) => setMarksPickerQuery(openMarksPicker(s), "src"))
    h.press("down")
    expect(h.press("x", true)).toBe(true)
    expect(letters(h.state())).toEqual(["a", "c"])
    expect(h.saved).toEqual([h.state().marks.marks])
    expect(h.state().marksPicker.open).toBe(true)
    expect(h.state().marks).toMatchObject({ current: null, previous: "a" })
  })

  test("deleting the last entry moves the selection up to the new last one", async () => {
    const h = await harness((s) => moveMarksPickerSelection(openMarksPicker(s), 2, 2))
    h.press("x", true)
    expect(letters(h.state())).toEqual(["a", "b"])
    expect(h.state().marksPicker.selectedIndex).toBe(1)
  })

  test("a bare x or j is typing, not a command", async () => {
    const h = await harness()
    expect(h.press("x")).toBe(true)
    expect(h.press("j")).toBe(true)
    expect(letters(h.state())).toEqual(["a", "b", "c"])
    expect(h.state().marksPicker.selectedIndex).toBe(0)
    expect(h.saved).toEqual([])
    expect(h.prevented()).toBe(0)
  })
})
