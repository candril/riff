import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { X, Y } from "../../testing/marks"
import { markSigns } from "./signs"
import type { Mark } from "./types"

const all = () => new DiffLineMapping([X, Y], "all")
const mark = (letter: string, line: number | null, side: Mark["side"] = "RIGHT", filename = "src/x.ts"): Mark => ({
  letter,
  filename,
  line,
  side,
})

describe("markSigns", () => {
  test("a mark sits on the row its line is drawn on, in the half of its side", () => {
    expect([...markSigns(all(), [mark("a", 10), mark("b", 9, "LEFT")])]).toEqual([
      [9, [{ letter: "a", side: "right" }]],
      [8, [{ letter: "b", side: "left" }]],
    ])
  })

  test("a mark whose line is gone sits on the row its jump lands on nearby", () => {
    // New line 7 is not in the diff; new line 9, on row 7, is the nearest.
    expect([...markSigns(all(), [mark("a", 7)])]).toEqual([[7, [{ letter: "a", side: "right" }]]])
  })

  test("a file mark sits on its file's header row", () => {
    expect([...markSigns(all(), [mark("a", null, "RIGHT", "src/y.ts")])]).toEqual([[13, [{ letter: "a", side: "right" }]]])
  })

  test("a mark in a file single-file mode is not showing is drawn nowhere", () => {
    expect(markSigns(new DiffLineMapping([X, Y], "single", 0), [mark("a", 2, "RIGHT", "src/y.ts")]).size).toBe(0)
  })

  test("of two marks on one row and side, the first in letter order shows, lowercase before uppercase", () => {
    expect(markSigns(all(), [mark("B", 10), mark("z", 10), mark("c", 10)]).get(9)).toEqual([{ letter: "c", side: "right" }])
    expect(markSigns(all(), [mark("B", 10), mark("A", 10)]).get(9)).toEqual([{ letter: "A", side: "right" }])
  })

  test("a context row carries a letter for each side, in letter order", () => {
    // Row 10 is old line 10 and new line 11.
    expect(markSigns(all(), [mark("b", 10, "LEFT"), mark("a", 11, "RIGHT")]).get(10)).toEqual([
      { letter: "a", side: "right" },
      { letter: "b", side: "left" },
    ])
  })
})
