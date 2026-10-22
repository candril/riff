import { describe, expect, test } from "bun:test"
import { createToastState } from "./state"

describe("createToastState", () => {
  test("starts with no toast", () => {
    expect(createToastState().current()).toBeNull()
  })

  test("show defaults to an info toast", () => {
    const toast = createToastState()
    toast.show("Copied")
    expect(toast.current()).toEqual({ message: "Copied", type: "info" })
  })

  test("a second show replaces the first", () => {
    const toast = createToastState()
    toast.show("Copied", "success")
    toast.show("Failed", "error")
    expect(toast.current()).toEqual({ message: "Failed", type: "error" })
  })

  test("clear hides the toast", () => {
    const toast = createToastState()
    toast.show("Copied")
    toast.clear()
    expect(toast.current()).toBeNull()
  })

  test("an empty message takes down the toast shown before it", () => {
    const toast = createToastState()
    toast.show("hi")
    toast.show("")
    expect(toast.current()).toBeNull()
  })

  test("an empty message shows no toast", () => {
    const toast = createToastState()
    toast.show("", "error")
    expect(toast.current()).toBeNull()
  })
})
