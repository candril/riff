import { describe, test, expect } from "bun:test"
import { draftNotificationModel, toastModel } from "./notification-model"
import type { DraftNotificationState } from "../state"

describe("toastModel", () => {
  test("each type has its own icon and keeps its tone", () => {
    expect(toastModel("Mark a set", "success")).toEqual({ icon: "✓", message: "Mark a set", tone: "success" })
    expect(toastModel("Failed", "error")).toEqual({ icon: "✗", message: "Failed", tone: "error" })
    expect(toastModel("Copied", "info")).toEqual({ icon: "i", message: "Copied", tone: "info" })
  })
})

describe("draftNotificationModel", () => {
  const draft = (over: Partial<DraftNotificationState> = {}): DraftNotificationState => ({
    filename: "src/a.ts",
    line: 12,
    side: "RIGHT",
    bodyPreview: "Looks fine.",
    mtimeMs: 0,
    ...over,
  })

  test("keeps the title and hint", () => {
    const model = draftNotificationModel(draft(), 60)
    expect(model.title).toBe("Claude drafted a comment")
    expect(model.hint).toBe("Ctrl+p: copy or discard it")
  })

  test("a single line names that line, a range names both ends", () => {
    expect(draftNotificationModel(draft(), 60).target).toBe("src/a.ts:12")
    expect(draftNotificationModel(draft({ startLine: 12 }), 60).target).toBe("src/a.ts:12")
    expect(draftNotificationModel(draft({ startLine: 8 }), 60).target).toBe("src/a.ts:8-12")
  })

  test("a comment on the old side is marked (−)", () => {
    expect(draftNotificationModel(draft({ side: "LEFT" }), 60).target).toBe("src/a.ts:12 (−)")
  })

  test("a target wider than the box keeps its tail behind a leading …", () => {
    const target = draftNotificationModel(draft({ filename: "src/deeply/nested/module/file.ts" }), 16).target
    expect(target).toBe("…dule/file.ts:12")
  })

  test("a word wider than the box is hard-broken", () => {
    expect(draftNotificationModel(draft({ bodyPreview: "see abcdefgh" }), 5).preview).toEqual(["see", "abcde", "fgh"])
  })

  test("a preview over three lines is clamped with … on the third", () => {
    const preview = draftNotificationModel(draft({ bodyPreview: "one two three four five six seven eight" }), 10).preview
    expect(preview).toEqual(["one two", "three four", "five six…"])
  })

  test("an empty body gives no preview rows", () => {
    expect(draftNotificationModel(draft({ bodyPreview: "" }), 60).preview).toEqual([])
    expect(draftNotificationModel(draft({ bodyPreview: "   " }), 60).preview).toEqual([])
  })
})
