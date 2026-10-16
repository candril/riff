import { test, expect, describe } from "bun:test"
import { markedCells, unifiedMarkers } from "./unified-markers"

describe("unifiedMarkers", () => {
  test("an empty line is never marked", () => {
    expect(unifiedMarkers(0, 0, 10)).toEqual({ left: false, right: false })
    expect(unifiedMarkers(0, 5, 10)).toEqual({ left: false, right: false })
  })

  test("a line exactly as wide as the code ends at the edge", () => {
    expect(unifiedMarkers(10, 0, 10)).toEqual({ left: false, right: false })
  })

  test("a line one cell wider runs past the right edge", () => {
    expect(unifiedMarkers(11, 0, 10)).toEqual({ left: false, right: true })
  })

  test("scrolled past a short line, only the left edge is marked", () => {
    expect(unifiedMarkers(3, 5, 10)).toEqual({ left: true, right: false })
  })

  test("scrolled into a long line, both edges are marked", () => {
    expect(unifiedMarkers(30, 5, 10)).toEqual({ left: true, right: true })
  })

  test("with no code cells there is nothing to mark", () => {
    expect(unifiedMarkers(30, 5, 0)).toEqual({ left: false, right: false })
    expect(unifiedMarkers(30, 5, -3)).toEqual({ left: false, right: false })
  })
})

describe("markedCells", () => {
  test("counts a line of code in cells, a surrogate pair as one, as the row lays it out", () => {
    expect(markedCells({ type: "addition", content: "const a = 1" })).toBe(11)
    expect(markedCells({ type: "context", content: "x = \u{1F600}" })).toBe(5)
    expect(markedCells({ type: "no-newline", content: "\\ No newline at end of file" })).toBe(27)
  })

  test("a hunk header is never measured", () => {
    expect(markedCells({ type: "hunk-header", content: "@@ -1,2 +1,2 @@ ".repeat(10) })).toBe(0)
  })
})
