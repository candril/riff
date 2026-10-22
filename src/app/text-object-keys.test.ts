import { describe, expect, test } from "bun:test"
import { textObjectTakes } from "./text-object-keys"
import { createInitialState, type AppState } from "../state"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createActionMenuState } from "../features/action-menu/state"
import { createFeedState } from "../features/feed/state"
import { createPrCommentInputState } from "../features/pr-info-panel/comment-input-state"

const diff = (patch: Partial<AppState> = {}): AppState => ({
  ...createInitialState([], [], "test", ""),
  focusedPanel: "diff",
  ...patch,
})
const pending = { pendingTextObject: { scope: "i" as const } }
const key = (name: string, ctrl = false) => ({ name, ctrl })
const pickers = {
  filePicker: createFilePickerState(),
  commentsPicker: createCommentsPickerState(),
  occurrencePicker: createOccurrencePickerState(),
  marksPicker: createMarksPickerState(),
  commitPicker: createCommitPickerState(),
  actionMenu: createActionMenuState(),
  activityFeed: createFeedState(),
  prCommentInput: createPrCommentInputState(),
}

describe("textObjectTakes", () => {
  test("takes any object key while one is pending in the diff", () => {
    expect(textObjectTakes(key("f"), diff(), pending, false, pickers)).toBe(true)
    expect(textObjectTakes(key("{"), diff(), pending, false, pickers)).toBe(true)
  })

  test("takes nothing with no text object pending", () => {
    expect(textObjectTakes(key("f"), diff(), { pendingTextObject: null }, false, pickers)).toBe(false)
  })

  test("takes nothing while the tree has focus", () => {
    expect(textObjectTakes(key("f"), diff({ focusedPanel: "tree" }), pending, false, pickers)).toBe(false)
  })

  test("leaves Ctrl-r to the chat's reach", () => {
    expect(textObjectTakes(key("r", true), diff(), pending, false, pickers)).toBe(false)
    expect(textObjectTakes(key("r", true), diff({ chatOpen: true }), pending, false, pickers)).toBe(false)
  })

  test("takes Ctrl-l, which the chat reaches only from the thread panel", () => {
    expect(textObjectTakes(key("l", true), diff({ chatOpen: true }), pending, false, pickers)).toBe(true)
  })
})
