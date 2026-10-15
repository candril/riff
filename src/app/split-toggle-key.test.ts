import { test, expect } from "bun:test"
import { createCursorState, setPendingFindChar } from "../vim-diff/cursor-state"
import { togglesSplit } from "./split-toggle-key"

const backslash = { name: "\\" }

test("\\ toggles split in the diff view", () => {
  expect(togglesSplit(backslash, "diff", createCursorState(), false)).toBe(true)
  expect(togglesSplit({ name: "\\", ctrl: true }, "diff", createCursorState(), false)).toBe(false)
  expect(togglesSplit(backslash, "state", createCursorState(), false)).toBe(false)
})

test("f\\, F\\, t\\ and T\\ find a backslash instead", () => {
  for (const type of ["f", "F", "t", "T"] as const) {
    expect(togglesSplit(backslash, "diff", setPendingFindChar(createCursorState(), type), false)).toBe(false)
  }
})

test("\\ after a prefix key belongs to the chord", () => {
  expect(togglesSplit(backslash, "diff", createCursorState(), true)).toBe(false)
})
