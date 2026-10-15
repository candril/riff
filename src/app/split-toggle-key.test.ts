import { test, expect } from "bun:test"
import { createCursorState, setPendingFindChar } from "../vim-diff/cursor-state"
import { togglesSplit } from "./split-toggle-key"

const backslash = { name: "\\" }

test("\\ toggles split in the diff view", () => {
  expect(togglesSplit(backslash, "diff", createCursorState())).toBe(true)
  expect(togglesSplit({ name: "\\", ctrl: true }, "diff", createCursorState())).toBe(false)
  expect(togglesSplit(backslash, "state", createCursorState())).toBe(false)
})

test("f\\, F\\, t\\ and T\\ find a backslash instead", () => {
  for (const type of ["f", "F", "t", "T"] as const) {
    expect(togglesSplit(backslash, "diff", setPendingFindChar(createCursorState(), type))).toBe(false)
  }
})
