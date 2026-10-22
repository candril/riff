import { describe, expect, test } from "bun:test"
import { createLinePeekState } from "./state"

const top = { row: 0, col: 0 }

function opened() {
  const linePeek = createLinePeekState()
  linePeek.toggle()
  return linePeek
}

describe("the line peek's state", () => {
  test("starts closed, on the new side at its top", () => {
    const linePeek = createLinePeekState()
    expect(linePeek.open()).toBe(false)
    expect(linePeek.snapshot()).toEqual({ side: "new", scroll: top })
  })

  test("toggling twice opens and then closes it", () => {
    const linePeek = createLinePeekState()
    linePeek.toggle()
    expect(linePeek.open()).toBe(true)
    linePeek.toggle()
    expect(linePeek.open()).toBe(false)
  })

  test("every opening starts on the new side at its top", () => {
    const linePeek = opened()
    linePeek.swapSide()
    linePeek.scrollBy(4, 2)
    linePeek.toggle()
    linePeek.toggle()
    expect(linePeek.open()).toBe(true)
    expect(linePeek.snapshot()).toEqual({ side: "new", scroll: top })
  })

  test("scrolling adds up and stops at the top and left edges", () => {
    const linePeek = opened()
    linePeek.scrollBy(3, 5)
    linePeek.scrollBy(2, -1)
    expect(linePeek.scroll()).toEqual({ row: 5, col: 4 })
    linePeek.scrollBy(-9, -9)
    expect(linePeek.scroll()).toEqual(top)
  })

  test("scrolling stops at the cap, so a held key does not run off", () => {
    const linePeek = opened()
    linePeek.scrollBy(99_999, 99_999)
    linePeek.scrollBy(5, 5)
    expect(linePeek.scroll()).toEqual({ row: 100_000, col: 100_000 })
    linePeek.scrollBy(-1, 0)
    expect(linePeek.scroll()).toEqual({ row: 99_999, col: 100_000 })
  })

  test("swapping the side flips it and goes back to the top", () => {
    const linePeek = opened()
    linePeek.scrollBy(7, 3)
    linePeek.swapSide()
    expect(linePeek.snapshot()).toEqual({ side: "old", scroll: top })
    linePeek.scrollBy(2, 0)
    linePeek.swapSide()
    expect(linePeek.snapshot()).toEqual({ side: "new", scroll: top })
  })

  test("closing closes an open peek and leaves a closed one closed", () => {
    const linePeek = opened()
    linePeek.close()
    expect(linePeek.open()).toBe(false)
    linePeek.close()
    expect(linePeek.open()).toBe(false)
  })
})
