import { test, expect, describe } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { markLetterOf, isMarkQuote, markChordOpenedBy, markChordAction, pendingMarkChordGivesWay, chordTimeoutMs } from "./keys"

describe("the key after m or '", () => {
  test("names a lowercase letter", () => {
    expect(markLetterOf(parseKeypress("a")!)).toBe("a")
  })

  test("names an uppercase letter from its sequence", () => {
    expect(markLetterOf(parseKeypress("A")!)).toBe("A")
  })

  test("names an uppercase letter from its name and shift when there is no sequence", () => {
    expect(markLetterOf({ name: "a", shift: true })).toBe("A")
    expect(markLetterOf({ name: "a", shift: false })).toBe("a")
  })

  test("names nothing for a key that is not a letter", () => {
    for (const raw of ["1", "'", "[", "\x1b", "\r", " "]) expect(markLetterOf(parseKeypress(raw)!)).toBeNull()
    expect(markLetterOf({ name: "escape", sequence: "\x1b" })).toBeNull()
    expect(markLetterOf({ name: "up" })).toBeNull()
  })

  test("' is the quote that opens and doubles a jump", () => {
    expect(isMarkQuote(parseKeypress("'")!)).toBe(true)
    expect(isMarkQuote(parseKeypress("a")!)).toBe(false)
    expect(isMarkQuote(parseKeypress("`")!)).toBe(false)
  })
})

describe("the mark chords", () => {
  test("open on m and ' while the diff has the keys in normal mode", () => {
    expect(markChordOpenedBy(parseKeypress("m")!, true)).toBe("m")
    expect(markChordOpenedBy(parseKeypress("'")!, true)).toBe("'")
  })

  test("leave m and ' alone anywhere else, and leave M and Ctrl keys alone always", () => {
    expect(markChordOpenedBy(parseKeypress("m")!, false)).toBeNull()
    expect(markChordOpenedBy(parseKeypress("'")!, false)).toBeNull()
    expect(markChordOpenedBy(parseKeypress("M")!, true)).toBeNull()
    expect(markChordOpenedBy({ name: "m", ctrl: true }, true)).toBeNull()
    expect(markChordOpenedBy(parseKeypress("a")!, true)).toBeNull()
  })

  test("m then a letter sets, ' then a letter jumps, '' flips", () => {
    expect(markChordAction("m", parseKeypress("a")!, true)).toEqual({ kind: "set", letter: "a" })
    expect(markChordAction("m", parseKeypress("B")!, true)).toEqual({ kind: "set", letter: "B" })
    expect(markChordAction("'", parseKeypress("a")!, true)).toEqual({ kind: "jump", letter: "a" })
    expect(markChordAction("'", parseKeypress("'")!, true)).toEqual({ kind: "flip" })
  })

  test("any other second key cancels", () => {
    expect(markChordAction("m", parseKeypress("'")!, true)).toEqual({ kind: "cancel", passKey: false })
    expect(markChordAction("m", parseKeypress("\x1b")!, true)).toEqual({ kind: "cancel", passKey: false })
    expect(markChordAction("'", parseKeypress("1")!, true)).toEqual({ kind: "cancel", passKey: false })
  })
})

describe("a pending mark chord once the diff has lost the keys", () => {
  test("cancels and lets the key run as itself, even a letter", () => {
    for (const opener of ["m", "'"] as const) {
      for (const raw of ["a", "j", "'", "\x1b"]) {
        expect(markChordAction(opener, parseKeypress(raw)!, false)).toEqual({ kind: "cancel", passKey: true })
      }
    }
  })

  test("drops the chord before any handler sees the key, so q, G, Tab, Escape and Ctrl keys reach theirs", () => {
    for (const opener of ["m", "'"]) {
      for (const raw of ["q", "G", "s", "i", "\t", "\x1b", "\x0b", "\x06", "j"]) {
        expect(pendingMarkChordGivesWay(opener, parseKeypress(raw)!, false)).toBe(true)
      }
    }
  })

  test("keeps the chord while the diff has the keys, and leaves other chords to their own matcher", () => {
    expect(pendingMarkChordGivesWay("m", parseKeypress("q")!, true)).toBe(false)
    expect(pendingMarkChordGivesWay("'", parseKeypress("\x1b")!, true)).toBe(false)
    expect(pendingMarkChordGivesWay("g", parseKeypress("q")!, false)).toBe(false)
    expect(pendingMarkChordGivesWay(null, parseKeypress("q")!, false)).toBe(false)
  })
})

describe("how long a chord waits for its second key", () => {
  test("m and ' wait for their letter however long it takes", () => {
    expect(chordTimeoutMs("m")).toBeNull()
    expect(chordTimeoutMs("'")).toBeNull()
  })

  test("], [, g and z give up after half a second", () => {
    for (const opener of ["]", "[", "g", "z"]) expect(chordTimeoutMs(opener)).toBe(500)
  })
})
