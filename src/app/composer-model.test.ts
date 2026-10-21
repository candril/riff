import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { composerModel } from "./composer-model"

const initial = createInitialState([], [], "test", "")

function overlay(patch: Partial<AppState["inlineCommentOverlay"]>): AppState {
  return {
    ...initial,
    inlineCommentOverlay: { ...initial.inlineCommentOverlay, open: true, filename: "src/greet.ts", line: 2, ...patch },
  }
}

describe("composerModel", () => {
  test("composing keys the session by its anchor and mode, seeded with the draft", () => {
    expect(composerModel(overlay({ mode: "compose", input: "a thought" }))).toEqual({
      key: "src/greet.ts:2:compose:",
      initialValue: "a thought",
      mode: "compose",
    })
  })

  test("editing keys the session by the comment being edited too", () => {
    expect(composerModel(overlay({ mode: "edit", input: "ask @al", editingId: "c1" }))).toEqual({
      key: "src/greet.ts:2:edit:c1",
      initialValue: "ask @al",
      mode: "edit",
    })
  })

  test("a closed overlay has no composer, even one left in compose mode", () => {
    expect(composerModel(overlay({ open: false, mode: "compose" }))).toBeNull()
  })

  test("an open overlay that is only showing comments has no composer", () => {
    expect(composerModel(overlay({ mode: "view" }))).toBeNull()
  })
})
