import { describe, expect, test } from "bun:test"
import { createPrCommentInputState } from "./comment-input-state"

const CLOSED = { open: false, text: "", loading: false, error: null }

describe("createPrCommentInputState", () => {
  test("starts closed and empty", () => {
    const input = createPrCommentInputState()
    expect(input.current()).toEqual(CLOSED)
    expect(input.isOpen()).toBe(false)
  })

  test("open clears any leftover text and error", () => {
    const input = createPrCommentInputState()
    input.setText("draft")
    input.setLoading(true)
    input.setError("boom")
    input.open()
    expect(input.current()).toEqual({ open: true, text: "", loading: false, error: null })
    expect(input.isOpen()).toBe(true)
  })

  test("close clears everything", () => {
    const input = createPrCommentInputState()
    input.open()
    input.setText("draft")
    input.setLoading(true)
    input.setError("boom")
    input.close()
    expect(input.current()).toEqual(CLOSED)
  })

  test("setText changes only the text", () => {
    const input = createPrCommentInputState()
    input.open()
    input.setText("hi")
    expect(input.current()).toEqual({ open: true, text: "hi", loading: false, error: null })
  })

  test("setLoading changes only the loading flag", () => {
    const input = createPrCommentInputState()
    input.setLoading(true)
    expect(input.current()).toEqual({ ...CLOSED, loading: true })
  })

  test("setError changes only the error", () => {
    const input = createPrCommentInputState()
    input.open()
    input.setText("hi")
    input.setError("boom")
    expect(input.current()).toEqual({ open: true, text: "hi", loading: false, error: "boom" })
  })
})
