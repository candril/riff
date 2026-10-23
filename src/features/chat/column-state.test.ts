import { describe, expect, test } from "bun:test"
import { createChatColumnState } from "./column-state"

describe("createChatColumnState", () => {
  test("starts closed", () => {
    expect(createChatColumnState().open()).toBe(false)
  })

  test("show opens the column and hide closes it", () => {
    const column = createChatColumnState()
    column.show()
    expect(column.open()).toBe(true)
    column.hide()
    expect(column.open()).toBe(false)
  })

  test("show and hide twice in a row leave it where the first put it", () => {
    const column = createChatColumnState()
    column.show()
    column.show()
    expect(column.open()).toBe(true)
    column.hide()
    column.hide()
    expect(column.open()).toBe(false)
  })
})
