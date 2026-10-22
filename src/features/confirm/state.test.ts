import { describe, expect, test } from "bun:test"
import { createConfirmState } from "./state"

describe("the confirm dialog's state", () => {
  test("show puts the dialog up and close takes it down", () => {
    const confirm = createConfirmState()
    expect(confirm.dialog()).toBeNull()
    confirm.show({ title: "Delete Comment", message: "Sure?", details: "body", onConfirm() {}, onCancel() {} })
    expect(confirm.dialog()).toMatchObject({ title: "Delete Comment", message: "Sure?", details: "body" })
    confirm.close()
    expect(confirm.dialog()).toBeNull()
    confirm.close()
    expect(confirm.dialog()).toBeNull()
  })

  test("the shown dialog answers with the callbacks it was handed", () => {
    const confirm = createConfirmState()
    const answers: string[] = []
    const onConfirm = () => answers.push("yes")
    const onCancel = () => answers.push("no")
    confirm.show({ title: "t", message: "m", onConfirm, onCancel })
    expect(confirm.dialog()?.onConfirm).toBe(onConfirm)
    expect(confirm.dialog()?.onCancel).toBe(onCancel)
    confirm.dialog()?.onConfirm()
    confirm.dialog()?.onCancel()
    expect(answers).toEqual(["yes", "no"])
  })
})
