import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { openMarksPicker, closeMarksPicker, setMarksPickerQuery, moveMarksPickerSelection } from "./picker-state"

const initial: AppState = createInitialState([], [], "", "")

describe("the marks picker", () => {
  test("opens empty and closes cleared", () => {
    const typed = setMarksPickerQuery(openMarksPicker(initial), "foo")
    expect(typed.marksPicker).toEqual({ open: true, query: "foo", selectedIndex: 0 })
    expect(closeMarksPicker(typed).marksPicker).toEqual({ open: false, query: "", selectedIndex: 0 })
  })

  test("a new query goes back to the first entry", () => {
    const moved = moveMarksPickerSelection(openMarksPicker(initial), 2, 5)
    expect(moved.marksPicker.selectedIndex).toBe(2)
    expect(setMarksPickerQuery(moved, "x").marksPicker.selectedIndex).toBe(0)
  })

  test("the selection stops at both ends", () => {
    const open = openMarksPicker(initial)
    expect(moveMarksPickerSelection(open, -1, 3).marksPicker.selectedIndex).toBe(0)
    expect(moveMarksPickerSelection(open, 9, 3).marksPicker.selectedIndex).toBe(3)
  })
})
