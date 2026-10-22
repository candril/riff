import { describe, expect, test } from "bun:test"
import { BLAME_PEEK, peekKeys, peekState } from "../../testing/peek-keys"

const ESC = "\x1b"
const CTRL_Y = "\x19"
const CTRL_R = "\x12"
// Under kitty Shift-g and Shift-y arrive named "g" and "y" with shift held.
const KITTY_SHIFT_G = "\x1b[103;2u"
const KITTY_SHIFT_Y = "\x1b[121;2u"

const peeking = () => peekState({ blamePeek: BLAME_PEEK })

describe("the blame peek", () => {
  test("Esc and q close it, unprevented as the chain left them", async () => {
    const keys = await peekKeys(peeking())
    expect(keys.press(ESC).defaultPrevented).toBe(false)
    expect(keys.press("q").defaultPrevented).toBe(false)
    expect(keys.calls).toEqual(["close", "close"])
    expect(keys.legacyKeys).toEqual([])
  })

  test("a bare y copies the sha; Ctrl-y and Shift-y are only held", async () => {
    const keys = await peekKeys(peeking())
    keys.press("y")
    keys.press(CTRL_Y)
    keys.press(KITTY_SHIFT_Y)
    expect(keys.calls).toEqual(["copySha"])
    expect(keys.legacyKeys).toEqual([])
  })

  test("a bare g goes on to the keymap's g sequences, while Shift-g and every other key are held", async () => {
    const keys = await peekKeys(peeking())
    for (const sequence of ["j", "i", KITTY_SHIFT_G, "g"]) keys.press(sequence)
    expect(keys.legacyKeys).toEqual(["g"])
    expect(keys.calls).toEqual([])
  })

  test("stands aside while the chain holds a chord", async () => {
    const keys = await peekKeys(peeking())
    keys.setChord("g")
    keys.press("q")
    expect(keys.calls).toEqual([])
    expect(keys.legacyKeys).toEqual(["q"])
  })

  test("takes the key a pending mark chord gives way to, and drops that chord", async () => {
    const keys = await peekKeys(peeking())
    keys.setChord("m")
    keys.press(ESC)
    expect(keys.calls).toEqual(["close"])
    expect(keys.chord()).toBeNull()
  })

  test("stands aside while a text object is pending in the diff", async () => {
    const keys = await peekKeys(peeking())
    keys.setVim({ pendingTextObject: { scope: "i" } })
    keys.press("q")
    expect(keys.calls).toEqual([])
    expect(keys.legacyKeys).toEqual(["q"])
  })

  test("lets Ctrl-r through to the chat's reach", async () => {
    const keys = await peekKeys(peeking())
    keys.press(CTRL_R)
    expect(keys.legacyKeys).toEqual(["r"])
  })

  test("left behind outside the diff, it holds nothing", async () => {
    const keys = await peekKeys({ ...peeking(), viewMode: "feed" })
    keys.press("q")
    expect(keys.calls).toEqual([])
    expect(keys.legacyKeys).toEqual(["q"])
  })
})
