import { describe, expect, test } from "bun:test"
import { createMarksPickerState } from "./picker-factory"

describe("the marks picker's state", () => {
  test("opens empty and closes cleared", () => {
    const marksPicker = createMarksPickerState()
    marksPicker.show()
    marksPicker.setQuery("foo")
    expect(marksPicker.open()).toBe(true)
    expect(marksPicker.snapshot()).toEqual({ query: "foo", selectedIndex: 0 })
    marksPicker.close()
    expect(marksPicker.open()).toBe(false)
    expect(marksPicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("a new query goes back to the first entry", () => {
    const marksPicker = createMarksPickerState()
    marksPicker.show()
    marksPicker.move(2, 5)
    expect(marksPicker.selectedIndex()).toBe(2)
    marksPicker.setQuery("x")
    expect(marksPicker.selectedIndex()).toBe(0)
  })

  test("the selection stops at both ends", () => {
    const marksPicker = createMarksPickerState()
    marksPicker.show()
    marksPicker.move(-1, 3)
    expect(marksPicker.selectedIndex()).toBe(0)
    marksPicker.move(9, 3)
    expect(marksPicker.selectedIndex()).toBe(3)
  })

  test("clampSelection pulls the selection back onto the last row, and never below the first", () => {
    const marksPicker = createMarksPickerState()
    marksPicker.show()
    marksPicker.move(3, 3)
    marksPicker.clampSelection(2)
    expect(marksPicker.selectedIndex()).toBe(2)
    marksPicker.clampSelection(5)
    expect(marksPicker.selectedIndex()).toBe(2)
    marksPicker.clampSelection(-1)
    expect(marksPicker.selectedIndex()).toBe(0)
  })
})
