import { describe, expect, test } from "bun:test"
import { pickerModels } from "./picker-models"
import { createInitialState, openCommentsPicker, openCommitPicker, type AppState } from "../state"
import { createFilePickerState } from "../features/file-picker/state"
import { X, Y } from "../testing/marks"

const NOW = new Date("2026-10-17T12:00:00Z")

function state(): AppState {
  return {
    ...createInitialState([X, Y], [], "local", "local changes"),
    commits: [{ sha: "a1b2c3d", message: "Add greeting", author: "octocat", date: new Date(NOW.getTime() - 5 * 60_000).toISOString() }],
  }
}

describe("pickerModels", () => {
  test("yields null for every picker while none is open", () => {
    expect(pickerModels(state(), null, 100, 40, NOW)).toEqual({ file: null, comments: null, marks: null, occurrence: null, commit: null })
  })

  test("yields the open picker's model and null for the rest", () => {
    const models = pickerModels(state(), createFilePickerState().snapshot(), 100, 40, NOW)
    expect(models.file?.rows).toHaveLength(2)
    expect(models.file?.count).toBe("1/2")
    expect(models.comments).toBeNull()
    expect(models.commit).toBeNull()
    expect(pickerModels(openCommentsPicker(state()), null, 100, 40, NOW).comments).not.toBeNull()
  })

  test("dates the commits against now and wraps the commit keys to the width", () => {
    const wide = pickerModels(openCommitPicker(state()), null, 200, 40, NOW).commit!
    expect(wide.rows[1]).toMatchObject({ sha: "a1b2c3d", time: "5m ago" })
    expect(wide.keys).toHaveLength(1)
    const later = pickerModels(openCommitPicker(state()), null, 100, 40, new Date(NOW.getTime() + 60 * 60_000)).commit!
    expect(later.rows[1]).toMatchObject({ time: "1h ago" })
    expect(later.keys).toHaveLength(2)
  })
})
