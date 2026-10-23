import { describe, expect, test } from "bun:test"
import { createCodePeekState } from "./code-peek-state"

describe("createCodePeekState", () => {
  test("starts closed", () => {
    expect(createCodePeekState().id()).toBeNull()
  })

  test("open peeks the given comment", () => {
    const peek = createCodePeekState()
    peek.open("c1")
    expect(peek.id()).toBe("c1")
  })

  test("open on another comment moves the peek to it", () => {
    const peek = createCodePeekState()
    peek.open("c1")
    peek.open("c2")
    expect(peek.id()).toBe("c2")
  })

  test("close drops the peek, and closing again is harmless", () => {
    const peek = createCodePeekState()
    peek.open("c1")
    peek.close()
    expect(peek.id()).toBeNull()
    peek.close()
    expect(peek.id()).toBeNull()
  })
})
