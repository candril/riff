import { describe, expect, test } from "bun:test"
import type { Comment } from "../../types"
import { halfPage } from "../../utils/half-page"
import { entrySpans, halfPageEntry, UNLAID } from "./motions"

describe("halfPage", () => {
  test("is half an even viewport and rounds an odd one down", () => {
    expect(halfPage(20)).toBe(10)
    expect(halfPage(21)).toBe(10)
  })

  test("still moves one row on a viewport of one row, or none at all", () => {
    expect(halfPage(1)).toBe(1)
    expect(halfPage(0)).toBe(1)
  })
})

describe("halfPageEntry", () => {
  test("lands on the entry holding the row half a page below the highlight's top", () => {
    // Tops at 0, 3, 6, 9: row 5 is in the second entry, row 6 starts the third.
    expect(halfPageEntry([3, 3, 3, 3], 0, 1, 10)).toBe(1)
    expect(halfPageEntry([3, 3, 3, 3], 0, 1, 12)).toBe(2)
  })

  test("comes back up by the same rows", () => {
    expect(halfPageEntry([3, 3, 3, 3], 3, -1, 10)).toBe(1)
    expect(halfPageEntry([3, 3, 3, 3], 3, -1, 12)).toBe(1)
    expect(halfPageEntry([3, 3, 3, 3], 3, -1, 14)).toBe(0)
  })

  test("a thread taller than half a page is passed in one step, and one after it is held to the next entry", () => {
    // A long expanded thread of 30 rows, then short collapsed ones.
    const spans = [3, 30, 3, 3, 3]
    expect(halfPageEntry(spans, 0, 1, 20)).toBe(1)
    expect(halfPageEntry(spans, 1, 1, 20)).toBe(2)
    expect(halfPageEntry(spans, 2, -1, 20)).toBe(1)
    expect(halfPageEntry(spans, 4, -1, 20)).toBe(1)
  })

  test("is clamped at both ends", () => {
    expect(halfPageEntry([3, 3, 3], 1, 1, 100)).toBe(2)
    expect(halfPageEntry([3, 3, 3], 2, 1, 100)).toBe(2)
    expect(halfPageEntry([3, 3, 3], 1, -1, 100)).toBe(0)
    expect(halfPageEntry([3, 3, 3], 0, -1, 100)).toBe(0)
  })

  test("an empty panel stays where it is", () => {
    expect(halfPageEntry([], 0, 1, 20)).toBe(0)
    expect(halfPageEntry([], 0, -1, 20)).toBe(0)
  })
})

const comment = (id: string, body: string): Comment => ({
  id,
  filename: "a.ts",
  line: 1,
  side: "RIGHT",
  body,
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
})

describe("entrySpans", () => {
  const order = [comment("a", "one"), comment("b", "one\ntwo"), comment("c", "x"), comment("d", "one\ntwo\nthree")]

  test("reads a mounted entry's rows off the next entry's top, and the last one's off the stack's bottom", () => {
    const layout = { viewportRows: 20, tops: new Map([["a", 4], ["b", 7], ["c", 15]]), bottom: 19 }
    expect(entrySpans(order, layout, 80).slice(0, 3)).toEqual([3, 8, 4])
  })

  test("guesses an unmounted entry's rows from its text, a thread's first comment carrying the divider above it", () => {
    expect(entrySpans(order, UNLAID, 80)).toEqual([6, 7, 6, 8])
    const reply = { ...comment("r", "one\n\ntwo"), inReplyTo: "a" }
    expect(entrySpans([reply], UNLAID, 80)).toEqual([4])
  })

  test("wraps an unmounted entry's long line to the columns its body has", () => {
    // A root's body starts four columns into the stack, a reply's eight.
    expect(entrySpans([comment("w", "x".repeat(200))], UNLAID, 40 + 4)).toEqual([5 + 5])
    const reply = { ...comment("r", "x".repeat(200)), inReplyTo: "w" }
    expect(entrySpans([reply], UNLAID, 40 + 8)).toEqual([2 + 5])
  })

  test("keeps fenced code to a row a line, as the panel draws it unwrapped", () => {
    const code = ["```", "y".repeat(200), "```"].join("\n")
    expect(entrySpans([comment("f", code)], UNLAID, 44)).toEqual([5 + 3])
  })
})
