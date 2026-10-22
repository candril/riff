import { describe, expect, test } from "bun:test"
import type { FileBlame } from "../../providers/blame/types"
import { createBlameColumnsState } from "./column-state"

const blame: FileBlame = [undefined, { kind: "uncommitted" }]

describe("the blame columns' factory", () => {
  test("toggling turns a file's column on loading, then off again, and says which", () => {
    const columns = createBlameColumnsState()
    expect(columns.toggle("a.ts")).toBe(true)
    expect(columns.columns().get("a.ts")).toEqual({ status: "loading" })
    expect(columns.loading("a.ts")).toBe(true)
    expect(columns.toggle("a.ts")).toBe(false)
    expect(columns.columns().has("a.ts")).toBe(false)
    expect(columns.loading("a.ts")).toBe(false)
  })

  test("each update sets a new map", () => {
    const columns = createBlameColumnsState()
    const before = columns.columns()
    columns.toggle("a.ts")
    expect(columns.columns()).not.toBe(before)
    expect(before.size).toBe(0)
  })

  test("each file's column is its own", () => {
    const columns = createBlameColumnsState()
    columns.toggle("a.ts")
    columns.toggle("b.ts")
    columns.toggle("a.ts")
    expect([...columns.columns().keys()]).toEqual(["b.ts"])
  })

  test("an answer fills a loading column", () => {
    const columns = createBlameColumnsState()
    columns.toggle("a.ts")
    columns.settle("a.ts", { head: blame, base: null })
    expect(columns.columns().get("a.ts")).toEqual({ status: "ready", head: blame, base: null })
    expect(columns.loading("a.ts")).toBe(false)
  })

  test("an answer for a column already turned off is dropped", () => {
    const columns = createBlameColumnsState()
    columns.toggle("a.ts")
    columns.toggle("a.ts")
    const off = columns.columns()
    columns.settle("a.ts", { head: blame, base: null })
    expect(columns.columns()).toBe(off)
  })

  test("a failure drops the column", () => {
    const columns = createBlameColumnsState()
    columns.toggle("a.ts")
    columns.settle("a.ts", { message: "boom" })
    expect(columns.columns().has("a.ts")).toBe(false)
  })

  test("dropping a column that is not on changes nothing", () => {
    const columns = createBlameColumnsState()
    const empty = columns.columns()
    columns.drop("a.ts")
    expect(columns.columns()).toBe(empty)
    columns.toggle("a.ts")
    columns.drop("a.ts")
    expect(columns.columns().size).toBe(0)
  })

  test("clearing turns every column off, and an empty map stays as it is", () => {
    const columns = createBlameColumnsState()
    const empty = columns.columns()
    columns.clear()
    expect(columns.columns()).toBe(empty)
    columns.toggle("a.ts")
    columns.toggle("b.ts")
    columns.settle("b.ts", { head: blame, base: null })
    columns.clear()
    expect(columns.columns().size).toBe(0)
  })

  test("an answer for a column loading when cleared is dropped", () => {
    const columns = createBlameColumnsState()
    columns.toggle("a.ts")
    columns.clear()
    columns.settle("a.ts", { head: blame, base: null })
    expect(columns.columns().size).toBe(0)
  })
})
