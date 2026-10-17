import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { buildFileTree } from "../../utils/file-tree"
import type { DiffFile } from "../../utils/diff-parser"
import type { Mark } from "../marks/types"
import { X, X_SHIFTED, Y } from "../../testing/marks"
import { followReloadedMarks } from "./marks"

/** The state just after a reload of `files`, still holding the marks set before it. */
function reloaded(files: DiffFile[], marks: Mark[]) {
  let state: AppState = createInitialState(files, buildFileTree(files), "local", "")
  state = { ...state, marks: { ...state.marks, marks, current: "a" } }
  const saved: (readonly Mark[])[] = []
  const ctx = {
    getState: () => state,
    setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
    saveMarks: (m: readonly Mark[]) => { saved.push(m) },
  }
  return { ctx, saved, state: () => state }
}

const set: Mark = { letter: "a", filename: "src/x.ts", line: 10, side: "RIGHT", text: "n10", head: "old" }

describe("marks across a refresh", () => {
  test("a refresh whose diff shifted a marked line moves the mark, keeps the visit, and saves once", () => {
    const r = reloaded([X_SHIFTED, Y], [set])
    followReloadedMarks(r.ctx, "new")
    const moved = { ...set, line: 12, head: "new" }
    expect(r.state().marks).toEqual({ marks: [moved], current: "a", previous: null })
    expect(r.saved).toEqual([[moved]])
  })

  test("a refresh that moved nothing saves nothing", () => {
    const r = reloaded([X, Y], [set])
    followReloadedMarks(r.ctx, "new")
    expect(r.state().marks.marks).toEqual([set])
    expect(r.saved).toEqual([])
  })
})
