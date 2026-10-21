import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { chatInputFocused, composerOpen, diffCursorShown } from "./diff-focus"

const initial: AppState = { ...createInitialState([], [], "", ""), viewMode: "diff" }

const comments = (overrides: Partial<AppState["inlineCommentOverlay"]>, focusedPanel: AppState["focusedPanel"]) =>
  (s: AppState): AppState => ({ ...s, focusedPanel, inlineCommentOverlay: { ...s.inlineCommentOverlay, open: true, ...overrides } })

const hidden: [string, (s: AppState) => AppState][] = [
  ["the help", (s) => ({ ...s, showHelp: true })],
  ["the file picker", (s) => ({ ...s, filePicker: { ...s.filePicker, open: true } })],
  ["the comments picker", (s) => ({ ...s, commentsPicker: { ...s.commentsPicker, open: true } })],
  ["the marks picker", (s) => ({ ...s, marksPicker: { ...s.marksPicker, open: true } })],
  ["the occurrence picker", (s) => ({ ...s, occurrencePicker: { ...s.occurrencePicker, open: true } })],
  ["the commit picker, its query closed", (s) => ({ ...s, commitPicker: { ...s.commitPicker, open: true, queryInput: false } })],
  ["the sync preview", (s) => ({ ...s, syncPreview: { ...s.syncPreview, open: true } })],
  ["the review preview", (s) => ({ ...s, reviewPreview: { ...s.reviewPreview, open: true } })],
  ["a confirmation", (s) => ({ ...s, confirmDialog: { title: "Delete", message: "Sure?", onConfirm() {}, onCancel() {} } })],
  ["the peek over the diff", (s) => ({ ...s, showLinePeek: true })],
  ["the comments panel holding the keys", comments({ mode: "view" }, "comments")],
  ["a composer", comments({ mode: "compose" }, "diff")],
  ["the chat holding the keys", (s) => ({ ...s, chatOpen: true, focusedPanel: "chat" })],
]

describe("the diff's cursor", () => {
  test("shows with nothing open", () => {
    expect(diffCursorShown(initial, false)).toBe(true)
  })

  test("hides while a prompt is open", () => {
    expect(diffCursorShown(initial, true)).toBe(false)
  })

  for (const [name, open] of hidden) {
    test(`hides under ${name}`, () => {
      expect(diffCursorShown(open(initial), false)).toBe(false)
    })
  }

  const shown: [string, (s: AppState) => AppState][] = [
    ["a toast", (s) => ({ ...s, toast: { ...s.toast, message: "Copied" } })],
    ["the file tree's focus", (s) => ({ ...s, focusedPanel: "tree" })],
    ["the comments panel open beside a diff that keeps the keys", comments({ mode: "view" }, "diff")],
    ["a peek left open behind the overview", (s) => ({ ...s, showLinePeek: true, viewMode: "state" })],
  ]
  for (const [name, change] of shown) {
    test(`stays with ${name}`, () => {
      expect(diffCursorShown(change(initial), false)).toBe(true)
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
  const chatting: AppState = { ...initial, chatOpen: true, focusedPanel: "chat" }

  test("has the keys while the chat is focused and nothing is drawn over it", () => {
    expect(chatInputFocused(chatting, false)).toBe(true)
    expect(chatInputFocused({ ...chatting, focusedPanel: "diff" }, false)).toBe(false)
  })

  test("gives them up to a prompt or an overlay drawn over it", () => {
    expect(chatInputFocused(chatting, true)).toBe(false)
    for (const [, open] of hidden.slice(0, 10)) expect(chatInputFocused(open(chatting), false)).toBe(false)
  })
})
