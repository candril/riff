import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { interactionSettled, type InteractionInputs } from "./jump-settled"

const initial: AppState = { ...createInitialState([], [], "", ""), viewMode: "diff" }
const idle: InteractionInputs = {
  state: initial,
  vim: { pendingFindChar: null, pendingTextObject: null },
  searchActive: false,
  flashActive: false,
  chordPending: false,
}

describe("an interaction is settled", () => {
  test("with nothing waiting for keys", () => {
    expect(interactionSettled(idle)).toBe(true)
  })

  test("not while a composer is drafting", () => {
    const state = { ...initial, inlineCommentOverlay: { ...initial.inlineCommentOverlay, open: true, mode: "compose" as const } }
    expect(interactionSettled({ ...idle, state })).toBe(false)
  })

  test("but a comments panel only being read does not hold it open", () => {
    const state = { ...initial, inlineCommentOverlay: { ...initial.inlineCommentOverlay, open: true, mode: "view" as const } }
    expect(interactionSettled({ ...idle, state })).toBe(true)
  })

  const open: [string, Partial<InteractionInputs>][] = [
    ["a picker", { state: { ...initial, filePicker: { ...initial.filePicker, open: true } } }],
    ["the marks picker", { state: { ...initial, marksPicker: { ...initial.marksPicker, open: true } } }],
    ["the occurrence picker", { state: { ...initial, occurrencePicker: { ...initial.occurrencePicker, open: true } } }],
    ["a filter prompt", { state: { ...initial, treeFilterInput: true } }],
    ["a search prompt", { searchActive: true }],
    ["flash", { flashActive: true }],
    ["a chord's first key", { chordPending: true }],
    ["f waiting for its character", { vim: { pendingFindChar: { type: "f" }, pendingTextObject: null } }],
    ["a text object waiting for its key", { vim: { pendingFindChar: null, pendingTextObject: { scope: "i" } } }],
  ]
  for (const [label, inputs] of open) {
    test(`not while ${label} is open`, () => {
      expect(interactionSettled({ ...idle, ...inputs })).toBe(false)
    })
  }
})
