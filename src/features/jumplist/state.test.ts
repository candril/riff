import { test, expect, describe } from "bun:test"
import { createJumpListState } from "./state"
import type { Jump } from "./types"
import type { Reach } from "./walk"

const reach: Reach = { files: [], viewingCommit: null }

const jump = (cursorLine: number, filename: string | null = null): Jump => ({
  fileIndex: null,
  filename,
  viewingCommit: null,
  viewMode: "diff",
  splitView: false,
  focusedPanel: "diff",
  anchor: null,
  cursorLine,
  cursorCol: 0,
})

const lines = (state: ReturnType<typeof createJumpListState>) => state.list().entries.map((entry) => entry.cursorLine)

const notAsked = (): Jump => {
  throw new Error("here is only asked for past the newest entry")
}

describe("createJumpListState", () => {
  test("starts empty, and back and forward find nothing there", () => {
    const state = createJumpListState()
    expect(state.list()).toEqual({ entries: [], index: 0 })
    expect(state.back(reach, notAsked)).toBeNull()
    expect(state.forward(reach)).toBeNull()
    expect(state.list()).toEqual({ entries: [], index: 0 })
  })

  test("push keeps a line once, holds 100 entries and leaves the index one past the end", () => {
    const state = createJumpListState()
    for (let line = 0; line < 105; line++) state.push(jump(line))
    state.push(jump(50))
    expect(lines(state)).toHaveLength(100)
    expect(lines(state)[0]).toBe(5)
    expect(lines(state).at(-1)).toBe(50)
    expect(lines(state).filter((line) => line === 50)).toHaveLength(1)
    expect(state.list().index).toBe(100)
  })

  test("back from past the end records where you are and lands on the entry before", () => {
    const state = createJumpListState()
    state.push(jump(1))
    state.push(jump(2))
    expect(state.back(reach, () => jump(8))?.cursorLine).toBe(2)
    expect(lines(state)).toEqual([1, 2, 8])
    expect(state.list().index).toBe(1)
  })

  test("back with no older entry to land on returns null and keeps the list as it was", () => {
    const state = createJumpListState()
    state.push(jump(1, "gone.ts"))
    state.push(jump(2, "left.ts"))
    const before = state.list()
    expect(state.back(reach, () => jump(8))).toBeNull()
    expect(state.list()).toBe(before)
    expect(lines(state)).toEqual([1, 2])
  })

  test("forward walks back to where back started, then stops", () => {
    const state = createJumpListState()
    state.push(jump(1))
    state.push(jump(2))
    state.back(reach, () => jump(8))
    expect(state.forward(reach)?.cursorLine).toBe(8)
    expect(state.list().index).toBe(2)
    expect(state.forward(reach)).toBeNull()
    expect(state.list().index).toBe(2)
  })

  test("clear empties the list", () => {
    const state = createJumpListState()
    state.push(jump(1))
    state.push(jump(2))
    state.clear()
    expect(state.list()).toEqual({ entries: [], index: 0 })
    expect(state.back(reach, notAsked)).toBeNull()
  })
})
