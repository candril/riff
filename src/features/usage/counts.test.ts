import { expect, test } from "bun:test"
import { addDelta, emptyDelta, parseCounts, spellKey } from "./counts"

test("keys are spelled the way the registry's shortcuts spell them", () => {
  expect(spellKey({ name: "/", sequence: "/" })).toBe("/")
  expect(spellKey({ name: "v", sequence: "V" })).toBe("V")
  expect(spellKey({ name: "return", sequence: "\r" })).toBe("Enter")
  expect(spellKey({ name: "escape", sequence: "\x1b" })).toBe("Esc")
  expect(spellKey({ name: "d", sequence: "\x04", ctrl: true })).toBe("Ctrl+d")
  expect(spellKey({ name: "down", sequence: "\x1b[B" })).toBe("down")
})

test("the first flush starts the count", () => {
  const delta = emptyDelta()
  delta.keys.set("gchord.refresh", 2)

  expect(addDelta(null, delta, new Date("2026-11-13T12:00:00Z"))).toEqual({
    since: "2026-11-13T12:00:00.000Z",
    keys: { "gchord.refresh": 2 },
    palette: {},
  })
})

test("a file that is no usage count reads as none, and stray entries drop", () => {
  expect(parseCounts(null)).toBeNull()
  expect(parseCounts({ keys: {} })).toBeNull()
  expect(parseCounts({ since: "x", keys: { a: 1, b: "2" }, palette: [] })).toEqual({ since: "x", keys: { a: 1 }, palette: {} })
})
