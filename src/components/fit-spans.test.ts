import { describe, expect, test } from "bun:test"
import { fitSpans, spansWidth } from "./fit-spans"

const A = { text: "abc", fg: "#111111" }
const B = { text: "défg", fg: "#222222" }

describe("fitSpans", () => {
  test("leaves spans that fit as they are", () => {
    expect(fitSpans([A, B], 7)).toEqual([A, B])
  })

  test("puts … in the last cell, in the colour of the span it cuts", () => {
    expect(fitSpans([A, B], 6)).toEqual([A, { text: "dé…", fg: B.fg }])
    expect(fitSpans([A, B], 4)).toEqual([A, { text: "…", fg: B.fg }])
    expect(fitSpans([A, B], 3)).toEqual([{ text: "ab…", fg: A.fg }])
    expect(fitSpans([A, B], 1)).toEqual([{ text: "…", fg: A.fg }])
    expect(fitSpans([A, B], 0)).toEqual([])
  })

  test("counts a wide character as two cells and never splits it", () => {
    const wide = { text: "日本語", fg: A.fg }
    expect(spansWidth([wide])).toBe(6)
    expect(fitSpans([wide], 4)).toEqual([{ text: "日…", fg: A.fg }])
  })
})
