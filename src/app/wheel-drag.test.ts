import { test, expect, describe } from "bun:test"
import { wheelDragRow } from "./wheel-drag"

const at = (scrollTop: number, cursorRow: number, more: { height?: number; total?: number; scrollOff?: number } = {}) =>
  wheelDragRow({ scrollTop, cursorRow, height: 10, total: 100, scrollOff: 3, ...more })

describe("wheelDragRow", () => {
  test("a cursor inside the margins stays where it is", () => {
    expect(at(20, 23)).toBeNull()
    expect(at(20, 26)).toBeNull()
  })

  test("a cursor scrolled off the top is dragged to the margin below the top edge", () => {
    expect(at(20, 5)).toBe(23)
    expect(at(20, 22)).toBe(23)
  })

  test("a cursor scrolled off the bottom is dragged to the margin above the bottom edge", () => {
    expect(at(20, 50)).toBe(26)
    expect(at(20, 27)).toBe(26)
  })

  test("at either end of the diff there is no margin to keep", () => {
    expect(at(0, 0)).toBeNull()
    expect(at(0, 40)).toBe(6)
    expect(at(90, 99)).toBeNull()
    expect(at(90, 10)).toBe(93)
  })

  test("the margin shrinks to leave a short window a middle row", () => {
    expect(at(20, 0, { height: 4, scrollOff: 5 })).toBe(21)
    expect(at(20, 0, { height: 2, scrollOff: 5 })).toBe(20)
  })

  test("nothing drags before there is a window, rows or a cursor row", () => {
    expect(at(0, 40, { height: 0 })).toBeNull()
    expect(at(0, 40, { total: 0 })).toBeNull()
    expect(at(20, -1)).toBeNull()
  })
})
