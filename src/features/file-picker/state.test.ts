import { describe, expect, test } from "bun:test"
import { createFilePickerState } from "./state"

describe("the file picker's state", () => {
  test("show opens it afresh, dropping a previous query and selection", () => {
    const filePicker = createFilePickerState()
    filePicker.show()
    filePicker.setQuery("app")
    filePicker.move(2, 5)
    filePicker.show()
    expect(filePicker.open()).toBe(true)
    expect(filePicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("close shuts it and clears the query and selection", () => {
    const filePicker = createFilePickerState()
    filePicker.show()
    filePicker.setQuery("app")
    filePicker.move(1, 5)
    filePicker.close()
    expect(filePicker.open()).toBe(false)
    expect(filePicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("setQuery puts the selection back on the first row", () => {
    const filePicker = createFilePickerState()
    filePicker.show()
    filePicker.move(3, 5)
    filePicker.setQuery("app")
    expect(filePicker.snapshot()).toEqual({ query: "app", selectedIndex: 0 })
  })

  test("move steps within the list", () => {
    const filePicker = createFilePickerState()
    filePicker.move(2, 5)
    filePicker.move(-1, 5)
    expect(filePicker.selectedIndex()).toBe(1)
  })

  test("move wraps past the last row to the first, and above the first to the last", () => {
    const filePicker = createFilePickerState()
    filePicker.move(-1, 3)
    expect(filePicker.selectedIndex()).toBe(3)
    filePicker.move(1, 3)
    expect(filePicker.selectedIndex()).toBe(0)
  })
})
