import { describe, test, expect } from "bun:test"
import { toastModel } from "./notification-model"

describe("toastModel", () => {
  test("each type has its own icon and keeps its tone", () => {
    expect(toastModel("Mark a set", "success")).toEqual({ icon: "✓", message: "Mark a set", tone: "success" })
    expect(toastModel("Failed", "error")).toEqual({ icon: "✗", message: "Failed", tone: "error" })
    expect(toastModel("Copied", "info")).toEqual({ icon: "i", message: "Copied", tone: "info" })
  })
})
