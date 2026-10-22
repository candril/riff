import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { buildFileTree } from "../../utils/file-tree"
import type { DiffFile } from "../../utils/diff-parser"
import { createMarksState } from "../marks/state"
import type { Mark } from "../marks/types"
import { X, X_SHIFTED, Y } from "../../testing/marks"
import { followReloadedMarks } from "./marks"

/** The state just after a reload of `files`, still holding the marks set before it. */
function reloaded(files: DiffFile[], placed: Mark[]) {
  const state: AppState = createInitialState(files, buildFileTree(files), "local", "")
  const marks = createMarksState()
  marks.reset(placed)
  marks.visit("a")
  const saved: (readonly Mark[])[] = []
  const ctx = {
    getState: () => state,
    marks,
    saveMarks: (m: readonly Mark[]) => { saved.push(m) },
  }
  return { ctx, saved, marks }
}

const set: Mark = { letter: "a", filename: "src/x.ts", line: 10, side: "RIGHT", text: "n10", head: "old" }

describe("marks across a refresh", () => {
  test("a refresh whose diff shifted a marked line moves the mark, keeps the visit, and saves once", () => {
    const r = reloaded([X_SHIFTED, Y], [set])
    followReloadedMarks(r.ctx, "new")
    const moved = { ...set, line: 12, head: "new" }
    expect(r.marks.snapshot()).toEqual({ marks: [moved], current: "a", previous: null })
    expect(r.saved).toEqual([[moved]])
  })

  test("a refresh that moved nothing saves nothing", () => {
    const r = reloaded([X, Y], [set])
    followReloadedMarks(r.ctx, "new")
    expect(r.marks.marks()).toEqual([set])
    expect(r.saved).toEqual([])
  })
})
