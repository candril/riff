import { expect, test } from "bun:test"
import type { FileBlame } from "../../providers/blame/types"
import { dropBlameColumn, settleBlameColumn, toggleBlameColumn, type BlameColumnState } from "./column-state"

const empty = { blameColumns: new Map<string, BlameColumnState>() as ReadonlyMap<string, BlameColumnState> }
const blame: FileBlame = [undefined, { kind: "uncommitted" }]

test("toggling turns a file's column on loading, then off again, and says which", () => {
  const on = toggleBlameColumn(empty, "a.ts")
  expect(on.on).toBe(true)
  expect(on.state.blameColumns.get("a.ts")).toEqual({ status: "loading" })
  expect(empty.blameColumns.size).toBe(0)
  const off = toggleBlameColumn(on.state, "a.ts")
  expect(off.on).toBe(false)
  expect(off.state.blameColumns.has("a.ts")).toBe(false)
})

test("each file's column is its own", () => {
  const a = toggleBlameColumn(empty, "a.ts").state
  const both = toggleBlameColumn(a, "b.ts").state
  expect([...toggleBlameColumn(both, "a.ts").state.blameColumns.keys()]).toEqual(["b.ts"])
})

test("an answer fills a loading column", () => {
  const loading = toggleBlameColumn(empty, "a.ts").state
  expect(settleBlameColumn(loading, "a.ts", { head: blame, base: null }).blameColumns.get("a.ts")).toEqual({
    status: "ready",
    head: blame,
    base: null,
  })
})

test("an answer for a column already turned off is dropped", () => {
  const off = toggleBlameColumn(toggleBlameColumn(empty, "a.ts").state, "a.ts").state
  expect(settleBlameColumn(off, "a.ts", { head: blame, base: null })).toBe(off)
})

test("a failure drops the column", () => {
  const loading = toggleBlameColumn(empty, "a.ts").state
  expect(settleBlameColumn(loading, "a.ts", { message: "boom" }).blameColumns.has("a.ts")).toBe(false)
})

test("dropping a column that is not on changes nothing", () => {
  expect(dropBlameColumn(empty, "a.ts")).toBe(empty)
  expect(dropBlameColumn(toggleBlameColumn(empty, "a.ts").state, "a.ts").blameColumns.size).toBe(0)
})
