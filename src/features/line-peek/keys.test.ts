import { describe, expect, test } from "bun:test"
import { peekKeys, peekState } from "../../testing/peek-keys"

const ESC = "\x1b"
const TAB = "\t"
const CTRL_D = "\x04"
const CTRL_U = "\x15"
const CTRL_J = "\x1b[106;5u"
const CTRL_R = "\x12"
const DOWN = "\x1b[B"
const UP = "\x1b[A"
const RIGHT = "\x1b[C"
const LEFT = "\x1b[D"
const KITTY_SHIFT_G = "\x1b[103;2u"

async function peeking(options: { height?: number } = {}) {
  const keys = await peekKeys(peekState(), options)
  keys.linePeek.toggle()
  return keys
}

describe("the line peek", () => {
  test("Esc and q close it, unprevented as the chain left them", async () => {
    for (const sequence of [ESC, "q"]) {
      const keys = await peeking()
      expect(keys.press(sequence).defaultPrevented).toBe(false)
      expect(keys.linePeek.open()).toBe(false)
      expect(keys.leftKeys).toEqual([])
    }
  })

  test("Tab swaps the side drawn", async () => {
    const keys = await peeking()
    keys.press(TAB)
    expect(keys.linePeek.side()).toBe("old")
    keys.press(TAB)
    expect(keys.linePeek.side()).toBe("new")
  })

  test("each step scrolls the drawing", async () => {
    const steps: [string, { row: number; col: number }][] = [
      ["j", { row: 1, col: 0 }], [DOWN, { row: 2, col: 0 }], ["k", { row: 1, col: 0 }], [UP, { row: 0, col: 0 }],
      ["l", { row: 0, col: 4 }], [RIGHT, { row: 0, col: 8 }], ["h", { row: 0, col: 4 }], [LEFT, { row: 0, col: 0 }],
    ]
    const keys = await peeking()
    for (const [sequence, scroll] of steps) {
      keys.press(sequence)
      expect(keys.linePeek.scroll()).toEqual(scroll)
    }
    expect(keys.leftKeys).toEqual([])
  })

  test("Ctrl-d and Ctrl-u scroll half the height; Ctrl-j is only held", async () => {
    const keys = await peeking({ height: 30 })
    keys.press(CTRL_D)
    expect(keys.linePeek.scroll()).toEqual({ row: 15, col: 0 })
    keys.press(CTRL_J)
    expect(keys.linePeek.scroll()).toEqual({ row: 15, col: 0 })
    keys.press(CTRL_U)
    expect(keys.linePeek.scroll()).toEqual({ row: 0, col: 0 })
    expect(keys.leftKeys).toEqual([])
  })

  test("a bare g goes on to the keymap's g sequences, while Shift-g and every other key are held", async () => {
    const keys = await peeking()
    for (const sequence of ["i", "y", KITTY_SHIFT_G, "g"]) keys.press(sequence)
    expect(keys.leftKeys).toEqual(["g"])
    expect(keys.linePeek.open()).toBe(true)
  })

  test("stands aside while the chain holds a chord", async () => {
    const keys = await peeking()
    keys.setChord("g")
    keys.press("l")
    expect(keys.linePeek.scroll()).toEqual({ row: 0, col: 0 })
    expect(keys.leftKeys).toEqual(["l"])
  })

  test("stands aside while a text object is pending in the diff", async () => {
    const keys = await peeking()
    keys.setVim({ pendingTextObject: { scope: "a" } })
    keys.press("q")
    expect(keys.linePeek.open()).toBe(true)
    expect(keys.leftKeys).toEqual(["q"])
  })

  test("lets Ctrl-r through to the chat's reach", async () => {
    const keys = await peeking()
    keys.press(CTRL_R)
    expect(keys.leftKeys).toEqual(["r"])
  })
})
