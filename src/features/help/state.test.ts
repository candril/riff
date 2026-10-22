import { describe, expect, test } from "bun:test"
import { createHelpState } from "./state"

describe("the help overlay's state", () => {
  test("toggle opens and closes it, from the top each time", () => {
    const help = createHelpState()
    help.toggle()
    help.scrollBy(3, 10)
    expect([help.open(), help.scroll()]).toEqual([true, 3])
    help.toggle()
    expect([help.open(), help.scroll()]).toEqual([false, 0])
    help.scrollBy(2, 10)
    help.toggle()
    expect([help.open(), help.scroll()]).toEqual([true, 0])
  })

  test("close shuts it and drops the scroll", () => {
    const help = createHelpState()
    help.toggle()
    help.scrollBy(5, 10)
    help.close()
    expect([help.open(), help.scroll()]).toEqual([false, 0])
    help.close()
    expect([help.open(), help.scroll()]).toEqual([false, 0])
  })

  test("scrollBy stops at the top and at maxScroll", () => {
    const help = createHelpState()
    help.toggle()
    help.scrollBy(-1, 10)
    expect(help.scroll()).toBe(0)
    help.scrollBy(25, 10)
    expect(help.scroll()).toBe(10)
    help.scrollBy(1, 10)
    expect(help.scroll()).toBe(10)
  })

  test("scrollBy answers on the first press after maxScroll shrank", () => {
    const help = createHelpState()
    help.toggle()
    help.scrollBy(10, 10)
    help.scrollBy(-1, 4)
    expect(help.scroll()).toBe(3)
  })
})
