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

  test("starts at the normal width, and toggleExpanded widens it and narrows it back", () => {
    const column = createChatColumnState()
    expect(column.expanded()).toBe(false)
    column.toggleExpanded()
    expect(column.expanded()).toBe(true)
    column.toggleExpanded()
    expect(column.expanded()).toBe(false)
  })

  test("closing and reopening the column keeps its width", () => {
    const column = createChatColumnState()
    column.show()
    column.toggleExpanded()
    column.hide()
    expect(column.expanded()).toBe(true)
    column.show()
    expect(column.expanded()).toBe(true)
  })
})
