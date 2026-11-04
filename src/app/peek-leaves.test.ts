import { describe, expect, test } from "bun:test"
import { chordAllowedUnderPeek } from "./peek-leaves"

describe("chordAllowedUnderPeek", () => {
  test("with no peek every chord acts", () => {
    for (const sequence of ["gg", "gi", "gl", "gb", "zw"]) expect(chordAllowedUnderPeek(sequence, "diff", false, false)).toBe(true)
  })

  test("the blame peek lets only go and gB through", () => {
    expect(chordAllowedUnderPeek("go", "diff", true, false)).toBe(true)
    expect(chordAllowedUnderPeek("gB!", "diff", true, false)).toBe(true)
    expect(chordAllowedUnderPeek("gb!", "diff", true, false)).toBe(true)
    for (const sequence of ["gb", "gg", "gi", "gl", "gf", "gG!"]) expect(chordAllowedUnderPeek(sequence, "diff", true, false)).toBe(false)
  })

  test("a blame peek left behind outside the diff blocks nothing", () => {
    expect(chordAllowedUnderPeek("gi", "state", true, false)).toBe(true)
  })

  test("the line peek lets only gl through", () => {
    expect(chordAllowedUnderPeek("gl", "diff", false, true)).toBe(true)
    for (const sequence of ["gb", "gB!", "go", "gg", "gi"]) expect(chordAllowedUnderPeek(sequence, "diff", false, true)).toBe(false)
  })
})
