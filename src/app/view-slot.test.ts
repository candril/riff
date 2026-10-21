import { test, expect } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { viewSlotOf } from "./view-slot"

const file = { filename: "a.ts" } as AppState["files"][number]
const base: AppState = { ...createInitialState([], [], "", ""), viewMode: "diff" }
const withFiles: AppState = { ...base, files: [file] }

test("an error wins over every view, and leaves no tree", () => {
  for (const viewMode of ["diff", "state", "feed"] as const) {
    expect(viewSlotOf({ ...withFiles, viewMode, error: "boom" }, { overview: true })).toEqual({ slot: "error", withTree: false })
  }
})

test("the overview needs the PR info panel", () => {
  const state = { ...withFiles, viewMode: "state" as const }
  expect(viewSlotOf(state, { overview: true })).toEqual({ slot: "overview", withTree: true })
  expect(viewSlotOf(state, { overview: false })).toEqual({ slot: "diff", withTree: true })
  expect(viewSlotOf({ ...base, viewMode: "state" }, { overview: false })).toEqual({ slot: "empty", withTree: false })
})

test("the feed keeps the tree only while there are files", () => {
  expect(viewSlotOf({ ...withFiles, viewMode: "feed" }, { overview: false })).toEqual({ slot: "feed", withTree: true })
  expect(viewSlotOf({ ...base, viewMode: "feed" }, { overview: false })).toEqual({ slot: "feed", withTree: false })
})

test("no files is the empty text, without a tree", () => {
  expect(viewSlotOf(base, { overview: false })).toEqual({ slot: "empty", withTree: false })
})

test("files are the diff, beside the tree", () => {
  expect(viewSlotOf(withFiles, { overview: false })).toEqual({ slot: "diff", withTree: true })
})
