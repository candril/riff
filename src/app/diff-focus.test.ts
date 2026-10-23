import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { chatInputFocused, composerOpen, diffCursorShown, type OutsideOverlays } from "./diff-focus"

const initial: AppState = { ...createInitialState([], [], "", ""), viewMode: "diff" }
const none: OutsideOverlays = { prompt: false, help: false, confirm: false, syncPreview: false, reviewPreview: false, filePicker: false, commentsPicker: false, occurrencePicker: false, marksPicker: false, commitPicker: false, actionMenu: false, linePeek: false, blamePeek: false }
const prompt: OutsideOverlays = { ...none, prompt: true }
const help: OutsideOverlays = { ...none, help: true }
const confirmation: OutsideOverlays = { ...none, confirm: true }
const syncPreview: OutsideOverlays = { ...none, syncPreview: true }
const reviewPreview: OutsideOverlays = { ...none, reviewPreview: true }
const filePicker: OutsideOverlays = { ...none, filePicker: true }
const commentsPicker: OutsideOverlays = { ...none, commentsPicker: true }
const occurrencePicker: OutsideOverlays = { ...none, occurrencePicker: true }
const marksPicker: OutsideOverlays = { ...none, marksPicker: true }
const commitPicker: OutsideOverlays = { ...none, commitPicker: true }
const linePeek: OutsideOverlays = { ...none, linePeek: true }
const blamePeek: OutsideOverlays = { ...none, blamePeek: true }

const comments = (overrides: Partial<AppState["inlineCommentOverlay"]>, focusedPanel: AppState["focusedPanel"]) =>
  (s: AppState): AppState => ({ ...s, focusedPanel, inlineCommentOverlay: { ...s.inlineCommentOverlay, open: true, ...overrides } })

/** What is open, given the state it starts from: AppState's part, the overlays' factories' and whether the chat column is open. */
type Scene = (s: AppState) => [AppState, OutsideOverlays, boolean]
const inState = (change: (s: AppState) => AppState): Scene => (s) => [change(s), none, false]

const hidden: [string, Scene][] = [
  ["the peek over the diff", (s) => [s, linePeek, false]],
  ["the blame peek over the diff", (s) => [s, blamePeek, false]],
  ["the comments panel holding the keys", inState(comments({ mode: "view" }, "comments"))],
  ["a composer", inState(comments({ mode: "compose" }, "diff"))],
  ["the chat holding the keys", (s) => [{ ...s, focusedPanel: "chat" }, none, true]],
]

describe("the diff's cursor", () => {
  test("shows with nothing open", () => {
    expect(diffCursorShown(initial, none, false)).toBe(true)
  })

  test("hides while a prompt is open", () => {
    expect(diffCursorShown(initial, prompt, false)).toBe(false)
  })

  test("hides under the help", () => {
    expect(diffCursorShown(initial, help, false)).toBe(false)
  })

  test("hides under a confirmation", () => {
    expect(diffCursorShown(initial, confirmation, false)).toBe(false)
  })

  test("hides under the sync preview", () => {
    expect(diffCursorShown(initial, syncPreview, false)).toBe(false)
  })

  test("hides under Submit Review", () => {
    expect(diffCursorShown(initial, reviewPreview, false)).toBe(false)
  })

  test("hides under the file picker", () => {
    expect(diffCursorShown(initial, filePicker, false)).toBe(false)
  })

  test("hides under the comments picker", () => {
    expect(diffCursorShown(initial, commentsPicker, false)).toBe(false)
  })

  test("hides under the occurrence picker", () => {
    expect(diffCursorShown(initial, occurrencePicker, false)).toBe(false)
  })

  test("hides under the marks picker", () => {
    expect(diffCursorShown(initial, marksPicker, false)).toBe(false)
  })

  test("hides under the commit picker, its query closed", () => {
    expect(diffCursorShown(initial, commitPicker, false)).toBe(false)
  })

  for (const [name, open] of hidden) {
    test(`hides under ${name}`, () => {
      expect(diffCursorShown(...open(initial))).toBe(false)
    })
  }

  const shown: [string, Scene][] = [
    ["the file tree's focus", inState((s) => ({ ...s, focusedPanel: "tree" }))],
    ["the comments panel open beside a diff that keeps the keys", inState(comments({ mode: "view" }, "diff"))],
    ["a peek left open behind the overview", (s) => [{ ...s, viewMode: "state" }, linePeek, false]],
    ["the chat open beside a diff that keeps the keys", (s) => [s, none, true]],
  ]
  for (const [name, change] of shown) {
    test(`stays with ${name}`, () => {
      expect(diffCursorShown(...change(initial))).toBe(true)
    })
  }
})

describe("the composer", () => {
  test("is open composing or editing a comment", () => {
    expect(composerOpen(comments({ mode: "compose" }, "diff")(initial))).toBe(true)
    expect(composerOpen(comments({ mode: "edit" }, "diff")(initial))).toBe(true)
  })

  test("is not open with the overlay in another mode, or closed", () => {
    expect(composerOpen(comments({ mode: "view" }, "diff")(initial))).toBe(false)
    expect(composerOpen(comments({ mode: "compose", open: false }, "diff")(initial))).toBe(false)
  })
})

describe("the chat's input", () => {
  const chatting: AppState = { ...initial, focusedPanel: "chat" }

  test("has the keys while the chat is focused and nothing is drawn over it", () => {
    expect(chatInputFocused(chatting, none, true)).toBe(true)
    expect(chatInputFocused({ ...chatting, focusedPanel: "diff" }, none, true)).toBe(false)
    expect(chatInputFocused(chatting, none, false)).toBe(false)
  })

  test("gives them up to a prompt or an overlay drawn over it", () => {
    expect(chatInputFocused(chatting, prompt, true)).toBe(false)
    expect(chatInputFocused(chatting, help, true)).toBe(false)
    expect(chatInputFocused(chatting, confirmation, true)).toBe(false)
    expect(chatInputFocused(chatting, syncPreview, true)).toBe(false)
    expect(chatInputFocused(chatting, reviewPreview, true)).toBe(false)
    expect(chatInputFocused(chatting, filePicker, true)).toBe(false)
    expect(chatInputFocused(chatting, commentsPicker, true)).toBe(false)
    expect(chatInputFocused(chatting, occurrencePicker, true)).toBe(false)
    expect(chatInputFocused(chatting, marksPicker, true)).toBe(false)
    expect(chatInputFocused(chatting, commitPicker, true)).toBe(false)
    for (const [, open] of hidden.slice(0, 2)) {
      const [state, outside] = open(chatting)
      expect(chatInputFocused(state, outside, true)).toBe(false)
    }
  })
})
