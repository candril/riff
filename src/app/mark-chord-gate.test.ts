import { expect, test } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { VimCursorState } from "../vim-diff/types"
import { diffTakesMarkChord } from "./mark-chord-gate"

const takes = (state: Partial<AppState>, vim: Partial<VimCursorState> = {}) =>
  diffTakesMarkChord({
    getState: () => ({ ...createInitialState([], [], "local", "local changes"), viewMode: "diff", focusedPanel: "diff", ...state }),
    getVimState: () => ({ ...createCursorState(), ...vim }),
  })

test("the diff in normal mode takes a mark chord", () => {
  expect(takes({})).toBe(true)
})

test("the tree, visual mode and a motion waiting for its key do not", () => {
  expect(takes({ focusedPanel: "tree" })).toBe(false)
  expect(takes({}, { mode: "visual-line" })).toBe(false)
  expect(takes({}, { pendingFindChar: { type: "f" } })).toBe(false)
  expect(takes({}, { pendingTextObject: { scope: "i" } })).toBe(false)
})
