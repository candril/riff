import { test, expect } from "bun:test"
import { overflowHints } from "./overflow-hints"

test("a list that fits says nothing", () => {
  expect(overflowHints(5, 0, 5)).toEqual({ above: null, below: null })
  expect(overflowHints(3, 0, 10)).toEqual({ above: null, below: null })
})

test("at the top, only the bottom row speaks, counting itself and every row past it", () => {
  expect(overflowHints(20, 0, 6)).toEqual({ above: null, below: "↓ 15 more" })
})

test("in the middle, both edges speak", () => {
  expect(overflowHints(20, 4, 6)).toEqual({ above: "↑ 5", below: "↓ 11 more" })
})

test("at the end, only the top row speaks", () => {
  expect(overflowHints(20, 14, 6)).toEqual({ above: "↑ 15", below: null })
})

test("one row past the edge reads as two: the hidden one and the one the hint covers", () => {
  expect(overflowHints(7, 0, 6)).toEqual({ above: null, below: "↓ 2 more" })
  expect(overflowHints(7, 1, 6)).toEqual({ above: "↑ 2", below: null })
})

test("a list two rows tall or less would be all hint, so it gets none", () => {
  expect(overflowHints(20, 5, 2)).toEqual({ above: null, below: null })
  expect(overflowHints(20, 5, 1)).toEqual({ above: null, below: null })
  expect(overflowHints(20, 5, 0)).toEqual({ above: null, below: null })
})
