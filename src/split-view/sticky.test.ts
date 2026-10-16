import { test, expect, describe } from "bun:test"
import { stickyHeaderLine } from "./sticky"

const unwrapped = (row: number) => row

describe("stickyHeaderLine", () => {
  test("no headers pins nothing", () => {
    expect(stickyHeaderLine([], unwrapped, 10)).toBeUndefined()
  })

  test("at the top nothing has scrolled away", () => {
    expect(stickyHeaderLine([0, 9], unwrapped, 0)).toBeUndefined()
  })

  test("a header on the top row is not pinned; one row past it is", () => {
    expect(stickyHeaderLine([2, 9], unwrapped, 2)).toBeUndefined()
    expect(stickyHeaderLine([2, 9], unwrapped, 3)).toBe(2)
  })

  test("between two headers the earlier is pinned, none on the later one's row, and the later one past it", () => {
    expect(stickyHeaderLine([0, 9], unwrapped, 5)).toBe(0)
    expect(stickyHeaderLine([0, 9], unwrapped, 8)).toBe(0)
    expect(stickyHeaderLine([0, 9], unwrapped, 9)).toBeUndefined()
    expect(stickyHeaderLine([0, 9], unwrapped, 10)).toBe(9)
  })

  test("wrapped rows put a header further down than its line index", () => {
    // Lines 1 to 8 take three rows each, so header line 9 starts on row 25.
    const wrapped = (row: number) => (row === 0 ? 0 : row <= 9 ? 1 + (row - 1) * 3 : 25 + (row - 9))
    expect(stickyHeaderLine([0, 9], wrapped, 12)).toBe(0)
    expect(stickyHeaderLine([0, 9], wrapped, 24)).toBe(0)
    expect(stickyHeaderLine([0, 9], wrapped, 25)).toBeUndefined()
    expect(stickyHeaderLine([0, 9], wrapped, 26)).toBe(9)
  })

  test("a collapsed file right above the next header is never pinned: it has no row to scroll into", () => {
    // Header 0, then file 1's header collapsed on line 5, then file 2's header on line 6.
    expect(stickyHeaderLine([0, 5, 6], unwrapped, 5)).toBeUndefined()
    expect(stickyHeaderLine([0, 5, 6], unwrapped, 6)).toBeUndefined()
    expect(stickyHeaderLine([0, 5, 6], unwrapped, 7)).toBe(6)
  })

  test("many headers", () => {
    const headers = Array.from({ length: 50 }, (_, n) => n * 4)
    for (let top = 1; top < 200; top++) {
      expect(stickyHeaderLine(headers, unwrapped, top)).toBe(top % 4 === 0 ? undefined : Math.floor(top / 4) * 4)
    }
  })
})
