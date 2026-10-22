import { test, expect, describe } from "bun:test"
import {
  isMarkLetter,
  setMark,
  deleteMark,
  visitMark,
  flipTarget,
  marksInOrder,
  stepMark,
} from "./store"
import { emptyMarks, type Mark, type MarksState } from "./types"

const at = (letter: string, line = 1, filename = "src/x.ts"): Mark => ({ letter, filename, line, side: "RIGHT" })
const withMarks = (...letters: string[]): MarksState =>
  letters.reduce((state, letter) => setMark(state, at(letter)), emptyMarks())

describe("the marks", () => {
  test("take only a single ASCII letter", () => {
    expect(["a", "z", "A", "Z"].every(isMarkLetter)).toBe(true)
    expect(["", "ab", "1", "'", "é", "["].some(isMarkLetter)).toBe(false)
  })

  test("setting a letter again moves it", () => {
    const state = setMark(setMark(emptyMarks(), at("a", 3)), at("a", 9, "src/y.ts"))
    expect(state.marks).toEqual([at("a", 9, "src/y.ts")])
  })

  test("deleting a mark forgets it as the current and the previous one", () => {
    const visited = visitMark(visitMark(withMarks("a", "b"), "a"), "b")
    expect(deleteMark(visited, "b")).toMatchObject({ current: null, previous: "a" })
    expect(deleteMark(visited, "a")).toMatchObject({ current: "b", previous: null })
  })

  test("'' alternates between the last two marks visited", () => {
    let state = withMarks("a", "b", "c")
    expect(flipTarget(state)).toBeNull()

    state = visitMark(state, "a")
    expect(flipTarget(state)).toBeNull()
    state = visitMark(state, "b")
    state = visitMark(state, "c")
    expect(flipTarget(state)).toBe("b")

    state = visitMark(state, flipTarget(state)!)
    expect(flipTarget(state)).toBe("c")
    state = visitMark(state, flipTarget(state)!)
    expect(flipTarget(state)).toBe("b")

    expect(visitMark(state, "c")).toBe(state)
  })

  test("'' has nowhere to go once the previous mark is deleted", () => {
    const state = visitMark(visitMark(withMarks("a", "b"), "a"), "b")
    expect(flipTarget({ ...state, marks: state.marks.filter((m) => m.letter !== "a") })).toBeNull()
  })

  test("run a–z, then A–Z", () => {
    expect(marksInOrder(withMarks("B", "b", "A", "z", "a")).map((m) => m.letter)).toEqual(["a", "b", "z", "A", "B"])
  })
})

describe("stepping through the marks", () => {
  const state = withMarks("A", "c", "a")

  test("goes to the neighbour in letter order and wraps at both ends", () => {
    expect(stepMark({ ...state, current: "a" }, 1)).toBe("c")
    expect(stepMark({ ...state, current: "c" }, 1)).toBe("A")
    expect(stepMark({ ...state, current: "A" }, 1)).toBe("a")
    expect(stepMark({ ...state, current: "a" }, -1)).toBe("A")
    expect(stepMark({ ...state, current: "A" }, -1)).toBe("c")
  })

  test("starts at either end without a current mark, or when it was deleted", () => {
    expect(stepMark(state, 1)).toBe("a")
    expect(stepMark(state, -1)).toBe("A")
    const deleted = { ...state, current: "q" }
    expect(stepMark(deleted, 1)).toBe("a")
    expect(stepMark(deleted, -1)).toBe("A")
  })

  test("has nothing to step to without marks", () => {
    expect(stepMark(emptyMarks(), 1)).toBeNull()
  })
})
