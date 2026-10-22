import { describe, expect, test } from "bun:test"
import { createCommentsPickerState } from "./state"

describe("the comments picker's state", () => {
  test("show opens it afresh, dropping a previous query and selection", () => {
    const commentsPicker = createCommentsPickerState()
    commentsPicker.show()
    commentsPicker.setQuery("nit")
    commentsPicker.move(2, 5)
    commentsPicker.show()
    expect(commentsPicker.open()).toBe(true)
    expect(commentsPicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("close shuts it and clears the query and selection", () => {
    const commentsPicker = createCommentsPickerState()
    commentsPicker.show()
    commentsPicker.setQuery("nit")
    commentsPicker.move(1, 5)
    commentsPicker.close()
    expect(commentsPicker.open()).toBe(false)
    expect(commentsPicker.snapshot()).toEqual({ query: "", selectedIndex: 0 })
  })

  test("setQuery puts the selection back on the first row", () => {
    const commentsPicker = createCommentsPickerState()
    commentsPicker.show()
    commentsPicker.move(3, 5)
    commentsPicker.setQuery("nit")
    expect(commentsPicker.snapshot()).toEqual({ query: "nit", selectedIndex: 0 })
  })

  test("move steps within the list", () => {
    const commentsPicker = createCommentsPickerState()
    commentsPicker.move(2, 5)
    commentsPicker.move(-1, 5)
    expect(commentsPicker.selectedIndex()).toBe(1)
  })

  test("move wraps past the last row to the first, and above the first to the last", () => {
    const commentsPicker = createCommentsPickerState()
    commentsPicker.move(-1, 3)
    expect(commentsPicker.selectedIndex()).toBe(3)
    commentsPicker.move(1, 3)
    expect(commentsPicker.selectedIndex()).toBe(0)
  })
})
