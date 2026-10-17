import { test, expect } from "bun:test"
import { cellsOf } from "../diff-rows/cells"
import { HELP_KEY_CELLS, HELP_SECTIONS, helpColumns } from "./help-sections"

test("the left column runs Navigation to Selection, the right Panels & Files to GitHub & Other", () => {
  const [left, right] = helpColumns()
  expect(left.map((s) => s.title)).toEqual(["Navigation", "Search & Jump", "Folds & Context", "Selection"])
  expect(right.map((s) => s.title)).toEqual(["Panels & Files", "Comments", "GitHub & Other"])
  expect([...left, ...right]).toEqual([...HELP_SECTIONS])
})

test("every key leaves at least a cell before its description", () => {
  for (const { keys } of HELP_SECTIONS) {
    for (const [key] of keys) expect(cellsOf(key)).toBeLessThanOrEqual(HELP_KEY_CELLS - 1)
  }
})
