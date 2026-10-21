import { describe, expect, test } from "bun:test"
import { theme } from "../theme"
import { prCommentPromptModel } from "./pr-comment-prompt"

const open = { open: true, text: "", loading: false, error: null }

describe("prCommentPromptModel", () => {
  test("is null while closed, whatever else is set", () => {
    expect(prCommentPromptModel({ open: false, text: "hi", loading: true, error: "boom" })).toBeNull()
  })

  test("shows the placeholder in overlay0 until there is text, then the text in theme.text", () => {
    expect(prCommentPromptModel(open)).toMatchObject({ text: "Type your comment...", textFg: theme.overlay0 })
    expect(prCommentPromptModel({ ...open, text: "hello" })).toMatchObject({ text: "hello", textFg: theme.text })
  })

  test("says how to submit when nothing is happening", () => {
    expect(prCommentPromptModel(open)).toMatchObject({ status: "Enter to submit", statusFg: theme.overlay0 })
  })

  test("shows an error in red", () => {
    expect(prCommentPromptModel({ ...open, error: "boom" })).toMatchObject({ status: "boom", statusFg: theme.red })
  })

  test("says it is submitting in yellow, over an error", () => {
    const submitting = { status: "Submitting...", statusFg: theme.yellow }
    expect(prCommentPromptModel({ ...open, loading: true })).toMatchObject(submitting)
    expect(prCommentPromptModel({ ...open, loading: true, error: "boom" })).toMatchObject(submitting)
  })

  test("treats an empty error as none", () => {
    expect(prCommentPromptModel({ ...open, error: "" })).toMatchObject({ status: "Enter to submit" })
  })
})
