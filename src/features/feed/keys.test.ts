import { describe, expect, test } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { feedTakes } from "./keys"
import { feedApp, feedKeys, feedOf } from "../../testing/feed-keys"

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
    const keys = await feedKeys()
    for (const press of ["j", DOWN, "j"]) keys.press(press)
    expect(keys.feed.highlightIndex()).toBe(3)
    for (const press of ["k", UP]) keys.press(press)
    expect(keys.feed.highlightIndex()).toBe(1)
    expect(keys.leftKeys).toEqual([])
  })

  test("Shift-j moves too, while the capitalised J and G reach the chain", async () => {
    const keys = await feedKeys()
    keys.press(KITTY_SHIFT_J)
    expect(keys.feed.highlightIndex()).toBe(1)
    keys.press(KITTY_J)
    keys.press(KITTY_G)
    expect(keys.feed.highlightIndex()).toBe(1)
    expect(keys.leftKeys).toEqual(["J", "G"])
  })

  test("u narrows to what is unseen and back", async () => {
    const keys = await feedKeys()
    keys.press("u")
    expect(keys.feed.unseenOnly()).toBe(true)
    keys.press("u")
    expect(keys.feed.unseenOnly()).toBe(false)
    expect(keys.leftKeys).toEqual([])
  })

  test("Enter opens an event row's target and a file row's file, and is swallowed on an empty feed", async () => {
    const keys = await feedKeys({ highlightIndex: 2 })
    expect(keys.press(ENTER).defaultPrevented).toBe(false)
    keys.set({ highlightIndex: 4 })
    keys.press(ENTER, "enter")
    expect(keys.calls).toEqual(["openEvent commit-abc", "openCommitFile abc src/diff.test.ts"])

    const empty = await feedKeys({ events: [] })
    empty.press(ENTER)
    expect(empty.calls).toEqual([])
    expect(empty.leftKeys).toEqual([])
  })

  test("Esc puts every narrowing back, and with nothing narrowed reaches the chain", async () => {
    const keys = await feedKeys({ types: new Set(["commit"]), unseenOnly: true, filter: "fix", highlightIndex: 1 })
    expect(keys.press(ESC).defaultPrevented).toBe(false)
    const feed = keys.feed.snapshot()
    expect([feed.types.size, feed.unseenOnly, feed.filter]).toEqual([0, false, ""])
    expect(keys.leftKeys).toEqual([])

    keys.press(ESC)
    expect(keys.leftKeys).toEqual(["escape"])
  })

  test("/ starts the filter and is prevented, the keypad's too; Shift-/ reaches the chain", async () => {
    const keys = await feedKeys()
    expect(keys.press("/").defaultPrevented).toBe(true)
    expect(keys.feed.filterInput()).toBe(true)

    const keypad = await feedKeys()
    expect(keypad.press(KEYPAD_SLASH).defaultPrevented).toBe(true)
    expect(keypad.feed.filterInput()).toBe(true)

    const shifted = await feedKeys()
    expect(shifted.press(KITTY_SHIFT_SLASH).defaultPrevented).toBe(false)
    expect(shifted.feed.filterInput()).toBe(false)
    expect([keys.leftKeys, keypad.leftKeys, shifted.leftKeys]).toEqual([[], [], ["/"]])
  })

  test("c, m, r, b, t and p each toggle their type", async () => {
    const keys = await feedKeys()
    for (const letter of ["c", "m", "r", "b", "t", "p"]) keys.press(letter)
    expect([...keys.feed.types()]).toEqual(["commit", "comment", "review", "check", "resolved", "push"])
    keys.press("c")
    expect(keys.feed.types().has("commit")).toBe(false)
    expect(keys.leftKeys).toEqual([])
  })

  test("g, q, i, a, Tab, s and an unknown letter reach the chain", async () => {
    const initial = feedApp()
    const keys = await feedKeys({}, initial)
    for (const press of ["g", "q", "i", "a", TAB, "s", "x"]) keys.press(press)
    expect(keys.leftKeys).toEqual(["g", "q", "i", "a", "tab", "s", "x"])
    expect(keys.state()).toBe(initial)
    expect(keys.feed.snapshot()).toEqual(feedOf())
  })

  test("Ctrl-p, Ctrl-o and Meta-j reach the chain", async () => {
    const keys = await feedKeys()
    for (const press of [CTRL_P, CTRL_O, META_J]) keys.press(press)
    expect(keys.leftKeys).toEqual(["p", "o", "j"])
    expect(keys.feed.highlightIndex()).toBe(0)
  })

  test("while the chain holds a chord, j is its second key", async () => {
    const keys = await feedKeys()
    keys.setChord("g")
    keys.press("j")
    expect(keys.leftKeys).toEqual(["j"])
    expect(keys.feed.highlightIndex()).toBe(0)
  })

  test("a pending ' gives way to the key, which the feed then takes", async () => {
    const keys = await feedKeys()
    keys.setChord("'")
    keys.press("j")
    expect(keys.chord()).toBeNull()
    expect(keys.feed.highlightIndex()).toBe(1)
    expect(keys.leftKeys).toEqual([])
  })

  test("the filter prompt clears on Esc and keeps on Enter, both prevented", async () => {
    const keys = await feedKeys({ filterInput: true, filter: "fix" })
    expect(keys.press(ESC).defaultPrevented).toBe(true)
    expect([keys.feed.filterInput(), keys.feed.filter()]).toEqual([false, ""])

    keys.set({ filterInput: true, filter: "fix" })
    expect(keys.press(ENTER).defaultPrevented).toBe(true)
    expect([keys.feed.filterInput(), keys.feed.filter()]).toEqual([false, "fix"])
    expect(keys.leftKeys).toEqual([])
  })

  test("the filter prompt holds Ctrl-p and letters unprevented, for its field to type", async () => {
    const keys = await feedKeys({ filterInput: true })
    expect(keys.press(CTRL_P).defaultPrevented).toBe(false)
    expect(keys.press("j").defaultPrevented).toBe(false)
    expect(keys.press("q").defaultPrevented).toBe(false)
    expect(keys.leftKeys).toEqual([])
    expect(keys.feed.highlightIndex()).toBe(0)
  })

  test("outside the feed nothing is taken", async () => {
    const keys = await feedKeys({}, { ...feedApp(), viewMode: "diff" })
    for (const press of ["j", "/", ENTER, "c"]) keys.press(press)
    expect(keys.leftKeys).toEqual(["j", "/", "return", "c"])
  })
})

describe("feedTakes", () => {
  test("takes the keys the feed acts on", () => {
    for (const press of ["j", DOWN, "k", UP, "u", ENTER, "/", KEYPAD_SLASH, KITTY_SHIFT_J, "c", "m", "r", "b", "t", "p"]) {
      expect({ press, taken: feedTakes(feedApp(), feedOf(), key(press), false) }).toEqual({ press, taken: true })
    }
  })

  test("leaves the rest to the chain", () => {
    for (const press of ["g", "q", "a", "x", TAB, ESC, KITTY_SHIFT_SLASH, KITTY_J, KITTY_G, CTRL_P, META_J]) {
      expect({ press, taken: feedTakes(feedApp(), feedOf(), key(press), false) }).toEqual({ press, taken: false })
    }
  })

  test("takes Esc only while something is narrowed", () => {
    expect(feedTakes(feedApp(), feedOf({ unseenOnly: true }), key(ESC), false)).toBe(true)
    expect(feedTakes(feedApp(), feedOf({ types: new Set(["commit"]) }), key(ESC), false)).toBe(true)
    expect(feedTakes(feedApp(), feedOf({ filter: "x" }), key(ESC), false)).toBe(true)
  })

  test("stands aside while the chain holds a chord, outside the filter prompt", () => {
    expect(feedTakes(feedApp(), feedOf(), key("j"), true)).toBe(false)
    expect(feedTakes(feedApp(), feedOf({ filterInput: true }), key("j"), true)).toBe(true)
  })

  test("takes every key in the filter prompt, and none outside the feed", () => {
    for (const press of [CTRL_P, "g", "x", META_J]) {
      expect(feedTakes(feedApp(), feedOf({ filterInput: true }), key(press), false)).toBe(true)
    }
    expect(feedTakes({ ...feedApp(), viewMode: "diff" }, feedOf(), key("j"), false)).toBe(false)
  })
})
