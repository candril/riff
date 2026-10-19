import { test, expect } from "bun:test"
import { edgeHints, overflowHints, threadsHiddenBelow } from "./overflow-hints"

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

test("edge hints count whatever unit they are given, and say nothing at zero", () => {
  expect(edgeHints(0, 0)).toEqual({ above: null, below: null })
  expect(edgeHints(4, 0)).toEqual({ above: "↑ 4", below: null })
  expect(edgeHints(0, 1)).toEqual({ above: null, below: "↓ 1 more" })
  expect(edgeHints(3, 9)).toEqual({ above: "↑ 3", below: "↓ 9 more" })
})

test("a thread whose last row reaches the edge row is hidden below, with every thread past the window", () => {
  expect(threadsHiddenBelow([], 28, 0)).toBe(0)
  expect(threadsHiddenBelow([5, 11, 17], 28, 0)).toBe(0)
  expect(threadsHiddenBelow([5, 11, 27], 28, 0)).toBe(0)
  expect(threadsHiddenBelow([5, 11, 28], 28, 0)).toBe(1)
  expect(threadsHiddenBelow([5, 23, 29, 35], 28, 6)).toBe(8)
})
