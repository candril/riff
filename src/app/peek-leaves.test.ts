import { describe, expect, test } from "bun:test"
import { chordAllowedUnderPeek } from "./peek-leaves"
import type { BlamePeekState } from "../features/blame/peek-state"

const peek: BlamePeekState = { target: { path: "a.ts", side: "head", line: 1 }, request: 1, status: "loading" }
const none = { blamePeek: null, viewMode: "diff" as const }

describe("chordAllowedUnderPeek", () => {
  test("with no peek every chord acts", () => {
    for (const sequence of ["gg", "gi", "gl", "gb", "zw"]) expect(chordAllowedUnderPeek(sequence, none, false)).toBe(true)
  })

  test("the blame peek lets only go and gb through", () => {
    const state = { ...none, blamePeek: peek }
    expect(chordAllowedUnderPeek("go", state, false)).toBe(true)
    expect(chordAllowedUnderPeek("gb", state, false)).toBe(true)
    for (const sequence of ["gg", "gi", "gl", "gf", "gG!"]) expect(chordAllowedUnderPeek(sequence, state, false)).toBe(false)
  })

  test("a blame peek left behind outside the diff blocks nothing", () => {
    expect(chordAllowedUnderPeek("gi", { ...none, blamePeek: peek, viewMode: "state" }, false)).toBe(true)
  })

  test("the line peek lets only gl through", () => {
    expect(chordAllowedUnderPeek("gl", none, true)).toBe(true)
    for (const sequence of ["gb", "go", "gg", "gi"]) expect(chordAllowedUnderPeek(sequence, none, true)).toBe(false)
  })
})
