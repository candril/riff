import { describe, test, expect } from "bun:test"
import { confirmDialogModel } from "./confirm-dialog-model"

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
})
