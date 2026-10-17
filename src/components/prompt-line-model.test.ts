import { describe, test, expect } from "bun:test"
import { flashPromptModel, searchPromptModel } from "./prompt-line-model"
import { createSearchState, type IncrementalSearchMatch, type SearchState } from "../vim-diff/search-state"
import { createFlashState, type FlashMatch, type FlashState } from "../vim-diff/flash-state"

const search = (over: Partial<SearchState>): SearchState => ({ ...createSearchState(), ...over })
const flash = (over: Partial<FlashState>): FlashState => ({ ...createFlashState(), active: true, ...over })
const aMatch = {} as IncrementalSearchMatch
const aTarget = (label: string): FlashMatch => ({ line: 0, startCol: 0, endCol: 1, label })

describe("searchPromptModel", () => {
  test("is null with no search typed or confirmed", () => {
    expect(searchPromptModel(search({}))).toBeNull()
  })

  test("a confirmed forward search with matches shows its pattern in the normal tone", () => {
    expect(searchPromptModel(search({ pattern: "foo", matches: [aMatch] }))).toEqual({
      prefix: "/",
      typing: false,
      pattern: "foo",
      tone: "normal",
      loading: false,
      error: null,
    })
  })

  test("a backward search types behind ?", () => {
    const model = searchPromptModel(search({ active: true, direction: "backward" }))
    expect(model?.prefix).toBe("?")
    expect(model?.typing).toBe(true)
  })

  test("nothing typed yet is not a miss", () => {
    expect(searchPromptModel(search({ active: true }))?.tone).toBe("normal")
  })

  test("a typed query with no matches turns the error tone", () => {
    expect(searchPromptModel(search({ active: true, promptValue: "zz" }))?.tone).toBe("error")
  })

  test("a confirmed pattern with no matches turns the error tone", () => {
    expect(searchPromptModel(search({ pattern: "zz" }))?.tone).toBe("error")
  })

  test("an error turns the error tone even with matches, and carries its message", () => {
    const model = searchPromptModel(search({ pattern: "(", matches: [aMatch], error: "Invalid regex" }))
    expect(model?.tone).toBe("error")
    expect(model?.error).toBe("Invalid regex")
  })

  test("carries loading", () => {
    expect(searchPromptModel(search({ active: true, loading: true }))?.loading).toBe(true)
  })
})

describe("flashPromptModel", () => {
  test("is null while flash is not active", () => {
    expect(flashPromptModel(createFlashState())).toBeNull()
  })

  test("with nothing typed, invites a jump", () => {
    expect(flashPromptModel(flash({}))).toEqual({ pattern: "", hint: "type to jump", noMatches: false })
  })

  test("counts one target in the singular", () => {
    expect(flashPromptModel(flash({ pattern: "a", matches: [aTarget("s")] }))?.hint).toBe("1 target")
  })

  test("counts several targets in the plural", () => {
    const matches = [aTarget("s"), aTarget("d"), aTarget("f")]
    expect(flashPromptModel(flash({ pattern: "ab", matches }))).toEqual({
      pattern: "ab",
      hint: "3 targets",
      noMatches: false,
    })
  })

  test("a typed pattern with no targets says so", () => {
    expect(flashPromptModel(flash({ pattern: "zz" }))).toEqual({ pattern: "zz", hint: "no targets", noMatches: true })
  })

  test("on a list, counts the rows whose labels still begin with what is typed", () => {
    const rows = [
      { id: "1", label: "a" },
      { id: "2", label: "sa" },
      { id: "3", label: "sd" },
    ]
    expect(flashPromptModel(flash({ surface: "tree", pattern: "s", rows }))?.hint).toBe("2 targets")
    // A list's matches are not its targets.
    expect(flashPromptModel(flash({ surface: "tree", pattern: "x", rows, matches: [aTarget("x")] }))?.noMatches).toBe(
      true
    )
  })
})
