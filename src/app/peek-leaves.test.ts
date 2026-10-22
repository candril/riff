import { describe, expect, test } from "bun:test"
import { chordAllowedUnderPeek } from "./peek-leaves"
import type { BlamePeekState } from "../features/blame/peek-state"

const peek: BlamePeekState = { target: { path: "a.ts", side: "head", line: 1 }, request: 1, status: "loading" }
const none = { blamePeek: null, showLinePeek: false, viewMode: "diff" as const }

describe("chordAllowedUnderPeek", () => {
  test("with no peek every chord acts", () => {
    for (const sequence of ["gg", "gi", "gl", "gb", "zw"]) expect(chordAllowedUnderPeek(sequence, none)).toBe(true)
  })

  test("the blame peek lets only go and gb through", () => {
    const state = { ...none, blamePeek: peek }
    expect(chordAllowedUnderPeek("go", state)).toBe(true)
    expect(chordAllowedUnderPeek("gb", state)).toBe(true)
    for (const sequence of ["gg", "gi", "gl", "gf", "gG!"]) expect(chordAllowedUnderPeek(sequence, state)).toBe(false)
  })

  test("a blame peek left behind outside the diff blocks nothing", () => {
    expect(chordAllowedUnderPeek("gi", { ...none, blamePeek: peek, viewMode: "state" })).toBe(true)
  })

  test("the line peek lets only gl through", () => {
    const state = { ...none, showLinePeek: true }
    expect(chordAllowedUnderPeek("gl", state)).toBe(true)
    for (const sequence of ["gb", "go", "gg", "gi"]) expect(chordAllowedUnderPeek(sequence, state)).toBe(false)
  })
})
