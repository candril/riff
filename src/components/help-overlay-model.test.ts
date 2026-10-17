import { describe, test, expect } from "bun:test"
import { helpOverlayModel } from "./help-overlay-model"

describe("helpOverlayModel", () => {
  test("keeps the version", () => {
    expect(helpOverlayModel("1.2.3")).toEqual({ version: "1.2.3" })
  })

  test("has no version key without a version", () => {
    expect(Object.keys(helpOverlayModel(undefined))).toEqual([])
  })
})
