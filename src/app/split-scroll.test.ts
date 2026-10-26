import { test, expect, describe } from "bun:test"
import { clampScroll, landRow, placeRow, revealRow } from "./split-scroll"

const window = (scrollTop: number, height = 10, rows = 100) => ({ scrollTop, height, rows })

describe("revealing the cursor row", () => {
  test("leaves the window alone while the row is clear of both margins", () => {
    expect(revealRow(window(20), 25, 3)).toBe(20)
  })

  test("scrolls up just far enough to keep the margin above", () => {
    expect(revealRow(window(20), 21, 3)).toBe(18)
  })

  test("scrolls down just far enough to keep the margin below", () => {
    expect(revealRow(window(20), 28, 3)).toBe(22)
  })

  test("never scrolls past the first or the last row", () => {
    expect(revealRow(window(5), 1, 3)).toBe(0)
    expect(revealRow(window(85), 99, 3)).toBe(90)
  })

  test("a window that shrank under the scroll is pulled back", () => {
    expect(clampScroll(window(95))).toBe(90)
    expect(clampScroll(window(4, 10, 6))).toBe(0)
  })

  test("before the view is laid out there is nothing to scroll", () => {
    expect(revealRow(window(0, 0), 50, 3)).toBe(0)
  })
})

describe("zz, zt and zb", () => {
  test("put the row in the middle, or a margin from the top or the bottom", () => {
    expect(placeRow(window(0), 50, "center", 3)).toBe(45)
    expect(placeRow(window(0), 50, "top", 3)).toBe(47)
    expect(placeRow(window(0), 50, "bottom", 3)).toBe(44)
  })

  test("stay inside the rows there are", () => {
    expect(placeRow(window(40), 2, "center", 3)).toBe(0)
    expect(placeRow(window(0), 98, "top", 3)).toBe(90)
  })
})

describe("where a jump lands", () => {
  test("a row below the window comes to the middle", () => {
    expect(landRow(window(0), 50, 3)).toBe(45)
  })

  test("a row in the lower half comes to the middle", () => {
    expect(landRow(window(20), 27, 3)).toBe(22)
  })

  test("a row in the upper half stays where it is", () => {
    expect(landRow(window(20), 25, 3)).toBe(20)
    expect(landRow(window(20), 23, 3)).toBe(20)
  })

  test("a row in the upper half still keeps the margin above", () => {
    expect(landRow(window(20), 21, 3)).toBe(18)
  })

  test("a row above the window comes to the middle", () => {
    expect(landRow(window(40), 10, 3)).toBe(5)
  })

  test("the last rows cannot come further up than the end of the content allows", () => {
    expect(landRow(window(0), 98, 3)).toBe(90)
  })

  test("before the view is laid out there is nothing to scroll", () => {
    expect(landRow(window(0, 0), 50, 3)).toBe(0)
  })
})
