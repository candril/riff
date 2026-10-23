import { describe, test, expect } from "bun:test"
import { confirmDialogModel } from "./confirm-dialog-model"
import type { ConfirmDialogState } from "../features/confirm/state"

const callbacks = { onConfirm: () => {}, onCancel: () => {} }

describe("confirmDialogModel", () => {
  test("keeps the title, message and details", () => {
    expect(confirmDialogModel({ title: "Delete?", message: "Gone for good.", details: "on GitHub", ...callbacks })).toEqual({
      title: "Delete?",
      message: "Gone for good.",
      details: "on GitHub",
    })
  })

  test("has no details key without details, and never the callbacks", () => {
    const model = confirmDialogModel({ title: "Delete?", message: "Gone for good.", ...callbacks })
    expect(Object.keys(model)).toEqual(["title", "message"])
  })

  test("keeps a second answer's key, label and details, but never its callback", () => {
    const asked: ConfirmDialogState = {
      title: "Merge?",
      message: "Into main.",
      ...callbacks,
      alternative: { key: "d", label: "and delete", onConfirm: () => {} },
    }
    expect(confirmDialogModel(asked)).toEqual({ title: "Merge?", message: "Into main.", alternative: { key: "d", label: "and delete" } })
  })
})
