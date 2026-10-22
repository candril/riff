import { describe, expect, test } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { feedTakes } from "./keys"
import { feedKeys, feedState } from "../../testing/feed-keys"

const ESC = "\x1b"
const ENTER = "\r"
const TAB = "\t"
const DOWN = "\x1b[B"
const UP = "\x1b[A"
const CTRL_P = "\x10"
const CTRL_O = "\x0f"
const META_J = "\x1bj"
// Under kitty Shift-j arrives named "j" with shift held, while these two
// arrive with capitalised names; Shift-/ is "/" with shift, and the keypad's
// slash is named kpdivide and spelled "/".
const KITTY_SHIFT_J = "\x1b[106;2u"
const KITTY_J = "\x1b[74;2u"
const KITTY_G = "\x1b[71;2u"
const KITTY_SHIFT_SLASH = "\x1b[47;2u"
const KEYPAD_SLASH = "\x1b[57410u"

const key = (sequence: string) => parseKeypress(sequence, { useKittyKeyboard: true })!

describe("the activity feed", () => {
  test("j, down, k and up move the highlight and never reach the chain", async () => {
    const keys = await feedKeys(feedState())
    for (const press of ["j", DOWN, "j"]) keys.press(press)
    expect(keys.state().feed.highlightIndex).toBe(3)
    for (const press of ["k", UP]) keys.press(press)
    expect(keys.state().feed.highlightIndex).toBe(1)
    expect(keys.legacyKeys).toEqual([])
  })

  test("Shift-j moves too, while the capitalised J and G reach the chain", async () => {
    const keys = await feedKeys(feedState())
    keys.press(KITTY_SHIFT_J)
    expect(keys.state().feed.highlightIndex).toBe(1)
    keys.press(KITTY_J)
    keys.press(KITTY_G)
    expect(keys.state().feed.highlightIndex).toBe(1)
    expect(keys.legacyKeys).toEqual(["J", "G"])
  })

  test("u narrows to what is unseen and back", async () => {
    const keys = await feedKeys(feedState())
    keys.press("u")
    expect(keys.state().feed.unseenOnly).toBe(true)
    keys.press("u")
    expect(keys.state().feed.unseenOnly).toBe(false)
    expect(keys.legacyKeys).toEqual([])
  })

  test("Enter opens an event row's target and a file row's file, and is swallowed on an empty feed", async () => {
    const keys = await feedKeys(feedState({ highlightIndex: 2 }))
    expect(keys.press(ENTER).defaultPrevented).toBe(false)
    keys.set(feedState({ highlightIndex: 4 }))
    keys.press(ENTER, "enter")
    expect(keys.calls).toEqual(["openEvent commit-abc", "openCommitFile abc src/diff.test.ts"])

    const empty = await feedKeys(feedState({ events: [] }))
    empty.press(ENTER)
    expect(empty.calls).toEqual([])
    expect(empty.legacyKeys).toEqual([])
  })

  test("Esc puts every narrowing back, and with nothing narrowed reaches the chain", async () => {
    const keys = await feedKeys(feedState({ types: new Set(["commit"]), unseenOnly: true, filter: "fix", highlightIndex: 1 }))
    expect(keys.press(ESC).defaultPrevented).toBe(false)
    const feed = keys.state().feed
    expect([feed.types.size, feed.unseenOnly, feed.filter]).toEqual([0, false, ""])
    expect(keys.legacyKeys).toEqual([])

    keys.press(ESC)
    expect(keys.legacyKeys).toEqual(["escape"])
  })

  test("/ starts the filter and is prevented, the keypad's too; Shift-/ reaches the chain", async () => {
    const keys = await feedKeys(feedState())
    expect(keys.press("/").defaultPrevented).toBe(true)
    expect(keys.state().feed.filterInput).toBe(true)

    const keypad = await feedKeys(feedState())
    expect(keypad.press(KEYPAD_SLASH).defaultPrevented).toBe(true)
    expect(keypad.state().feed.filterInput).toBe(true)

    const shifted = await feedKeys(feedState())
    expect(shifted.press(KITTY_SHIFT_SLASH).defaultPrevented).toBe(false)
    expect(shifted.state().feed.filterInput).toBe(false)
    expect([keys.legacyKeys, keypad.legacyKeys, shifted.legacyKeys]).toEqual([[], [], ["/"]])
  })

  test("c, m, r, b, t and p each toggle their type", async () => {
    const keys = await feedKeys(feedState())
    for (const letter of ["c", "m", "r", "b", "t", "p"]) keys.press(letter)
    expect([...keys.state().feed.types]).toEqual(["commit", "comment", "review", "check", "resolved", "push"])
    keys.press("c")
    expect(keys.state().feed.types.has("commit")).toBe(false)
    expect(keys.legacyKeys).toEqual([])
  })

  test("g, q, i, a, Tab, s and an unknown letter reach the chain", async () => {
    const initial = feedState()
    const keys = await feedKeys(initial)
    for (const press of ["g", "q", "i", "a", TAB, "s", "x"]) keys.press(press)
    expect(keys.legacyKeys).toEqual(["g", "q", "i", "a", "tab", "s", "x"])
    expect(keys.state()).toBe(initial)
  })

  test("Ctrl-p, Ctrl-o and Meta-j reach the chain", async () => {
    const keys = await feedKeys(feedState())
    for (const press of [CTRL_P, CTRL_O, META_J]) keys.press(press)
    expect(keys.legacyKeys).toEqual(["p", "o", "j"])
    expect(keys.state().feed.highlightIndex).toBe(0)
  })

  test("while the chain holds a chord, j is its second key", async () => {
    const keys = await feedKeys(feedState())
    keys.setChord("g")
    keys.press("j")
    expect(keys.legacyKeys).toEqual(["j"])
    expect(keys.state().feed.highlightIndex).toBe(0)
  })

  test("a pending ' gives way to the key, which the feed then takes", async () => {
    const keys = await feedKeys(feedState())
    keys.setChord("'")
    keys.press("j")
    expect(keys.chord()).toBeNull()
    expect(keys.state().feed.highlightIndex).toBe(1)
    expect(keys.legacyKeys).toEqual([])
  })

  test("the filter prompt clears on Esc and keeps on Enter, both prevented", async () => {
    const keys = await feedKeys(feedState({ filterInput: true, filter: "fix" }))
    expect(keys.press(ESC).defaultPrevented).toBe(true)
    expect([keys.state().feed.filterInput, keys.state().feed.filter]).toEqual([false, ""])

    keys.set(feedState({ filterInput: true, filter: "fix" }))
    expect(keys.press(ENTER).defaultPrevented).toBe(true)
    expect([keys.state().feed.filterInput, keys.state().feed.filter]).toEqual([false, "fix"])
    expect(keys.legacyKeys).toEqual([])
  })

  test("the filter prompt holds Ctrl-p and letters unprevented, for its field to type", async () => {
    const keys = await feedKeys(feedState({ filterInput: true }))
    expect(keys.press(CTRL_P).defaultPrevented).toBe(false)
    expect(keys.press("j").defaultPrevented).toBe(false)
    expect(keys.press("q").defaultPrevented).toBe(false)
    expect(keys.legacyKeys).toEqual([])
    expect(keys.state().feed.highlightIndex).toBe(0)
  })

  test("outside the feed nothing is taken", async () => {
    const keys = await feedKeys({ ...feedState(), viewMode: "diff" })
    for (const press of ["j", "/", ENTER, "c"]) keys.press(press)
    expect(keys.legacyKeys).toEqual(["j", "/", "return", "c"])
  })
})

describe("feedTakes", () => {
  test("takes the keys the feed acts on", () => {
    for (const press of ["j", DOWN, "k", UP, "u", ENTER, "/", KEYPAD_SLASH, KITTY_SHIFT_J, "c", "m", "r", "b", "t", "p"]) {
      expect({ press, taken: feedTakes(feedState(), key(press), false) }).toEqual({ press, taken: true })
    }
  })

  test("leaves the rest to the chain", () => {
    for (const press of ["g", "q", "a", "x", TAB, ESC, KITTY_SHIFT_SLASH, KITTY_J, KITTY_G, CTRL_P, META_J]) {
      expect({ press, taken: feedTakes(feedState(), key(press), false) }).toEqual({ press, taken: false })
    }
  })

  test("takes Esc only while something is narrowed", () => {
    expect(feedTakes(feedState({ unseenOnly: true }), key(ESC), false)).toBe(true)
    expect(feedTakes(feedState({ types: new Set(["commit"]) }), key(ESC), false)).toBe(true)
    expect(feedTakes(feedState({ filter: "x" }), key(ESC), false)).toBe(true)
  })

  test("stands aside while the chain holds a chord, outside the filter prompt", () => {
    expect(feedTakes(feedState(), key("j"), true)).toBe(false)
    expect(feedTakes(feedState({ filterInput: true }), key("j"), true)).toBe(true)
  })

  test("takes every key in the filter prompt, and none outside the feed", () => {
    for (const press of [CTRL_P, "g", "x", META_J]) {
      expect(feedTakes(feedState({ filterInput: true }), key(press), false)).toBe(true)
    }
    expect(feedTakes({ ...feedState(), viewMode: "diff" }, key("j"), false)).toBe(false)
  })
})
