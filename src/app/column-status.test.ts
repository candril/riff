import { test, expect } from "bun:test"
import { diffColumnStatus, splitOn, type ColumnStatusDeps } from "./column-status"

function deps(over: Partial<ColumnStatusDeps> = {}): ColumnStatusDeps {
  return {
    viewMode: "diff",
    vimState: { line: 4, col: 7 },
    split: { island: { columnStatus: () => ({ col: 3, total: 90 }) } },
    vimDiffView: { getColumnStatus: (line, col) => ({ col: line * 10 + col, total: 200 }) },
    ...over,
  }
}

test("outside the diff there is no readout", () => {
  expect(diffColumnStatus(true, deps({ viewMode: "state" }))).toBeNull()
  expect(diffColumnStatus(false, deps({ viewMode: "state" }))).toBeNull()
})

test("split asks the island, which counts the active pane's cells", () => {
  expect(diffColumnStatus(true, deps())).toEqual({ col: 3, total: 90 })
})

test("unified asks the diff view about the cursor's line and column", () => {
  expect(diffColumnStatus(false, deps())).toEqual({ col: 47, total: 200 })
})

test("split is on only when it is shown and there are files without an error", () => {
  const shown = { shown: () => true }
  expect(splitOn({ error: null, files: [{} as never] }, shown)).toBe(true)
  expect(splitOn({ error: "boom", files: [{} as never] }, shown)).toBe(false)
  expect(splitOn({ error: null, files: [] }, shown)).toBe(false)
  expect(splitOn({ error: null, files: [{} as never] }, { shown: () => false })).toBe(false)
})
