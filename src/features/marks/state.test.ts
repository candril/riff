import { test, expect, describe } from "bun:test"
import { createMarksState } from "./state"
import type { Mark } from "./types"

const at = (letter: string, line = 1, filename = "src/x.ts"): Mark => ({ letter, filename, line, side: "RIGHT" })

const visited = (...letters: string[]) => {
  const state = createMarksState()
  for (const letter of letters) state.set(at(letter))
  for (const letter of letters) state.visit(letter)
  return state
}

describe("createMarksState", () => {
  test("starts with no marks and nothing visited", () => {
    expect(createMarksState().snapshot()).toEqual({ marks: [], current: null, previous: null })
  })

  test("set adds a mark, and setting its letter again moves it", () => {
    const state = createMarksState()
    state.set(at("a", 3))
    state.set(at("b"))
    state.set(at("a", 9, "src/y.ts"))
    expect(state.marks()).toEqual([at("b"), at("a", 9, "src/y.ts")])
  })

  test("set keeps current and previous", () => {
    const state = visited("a", "b")
    state.set(at("c"))
    expect(state.snapshot()).toMatchObject({ current: "b", previous: "a" })
  })

  test("visit makes the letter current and the old current previous, and revisiting it changes nothing", () => {
    const state = visited("a", "b")
    expect(state.snapshot()).toMatchObject({ current: "b", previous: "a" })
    state.visit("b")
    expect(state.snapshot()).toMatchObject({ current: "b", previous: "a" })
  })

  test("remove drops the mark and forgets it as current or previous", () => {
    const state = visited("a", "b")
    state.remove("a")
    expect(state.snapshot()).toEqual({ marks: [at("b")], current: "b", previous: null })
    state.remove("b")
    expect(state.snapshot()).toEqual({ marks: [], current: null, previous: null })
  })

  test("replace swaps the list and keeps current and previous", () => {
    const state = visited("a", "b")
    state.replace([at("a", 12), at("b", 4)])
    expect(state.snapshot()).toEqual({ marks: [at("a", 12), at("b", 4)], current: "b", previous: "a" })
  })

  test("reset swaps the list and forgets current and previous", () => {
    const state = visited("a", "b")
    state.reset([at("z")])
    expect(state.snapshot()).toEqual({ marks: [at("z")], current: null, previous: null })
  })
})
