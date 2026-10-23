import { describe, expect, test } from "bun:test"
import { createFileFoldsState } from "./file-folds-state"

describe("createFileFoldsState", () => {
  test("starts with nothing folded", () => {
    const folds = createFileFoldsState()
    expect([...folds.collapsed()]).toEqual([])
    expect(folds.isCollapsed("a.ts")).toBe(false)
  })

  test("toggle folds a file and a second toggle unfolds it", () => {
    const folds = createFileFoldsState()
    folds.toggle("a.ts")
    expect(folds.isCollapsed("a.ts")).toBe(true)
    folds.toggle("a.ts")
    expect(folds.isCollapsed("a.ts")).toBe(false)
  })

  test("toggle leaves the other folded files alone", () => {
    const folds = createFileFoldsState()
    folds.toggle("a.ts")
    folds.toggle("b.ts")
    folds.toggle("a.ts")
    expect([...folds.collapsed()]).toEqual(["b.ts"])
  })

  test("collapse adds to the folded files", () => {
    const folds = createFileFoldsState()
    folds.toggle("a.ts")
    folds.collapse(["b.ts", "c.ts"])
    expect([...folds.collapsed()].sort()).toEqual(["a.ts", "b.ts", "c.ts"])
  })

  test("expand unfolds only the files it is given", () => {
    const folds = createFileFoldsState()
    folds.collapse(["a.ts", "b.ts", "c.ts"])
    folds.expand(["a.ts", "c.ts", "d.ts"])
    expect([...folds.collapsed()]).toEqual(["b.ts"])
  })

  test("collapse and expand keep the set when nothing changes", () => {
    const folds = createFileFoldsState()
    folds.collapse(["a.ts"])
    const before = folds.collapsed()
    folds.collapse(["a.ts"])
    folds.expand(["b.ts"])
    folds.collapse([])
    expect(folds.collapsed()).toBe(before)
  })

  test("collapseAll replaces every folded file", () => {
    const folds = createFileFoldsState()
    folds.toggle("a.ts")
    folds.collapseAll(["b.ts", "c.ts"])
    expect([...folds.collapsed()].sort()).toEqual(["b.ts", "c.ts"])
  })

  test("clear unfolds every file", () => {
    const folds = createFileFoldsState()
    folds.collapse(["a.ts", "b.ts"])
    folds.clear()
    expect(folds.collapsed().size).toBe(0)
  })

  test("clear keeps the set when nothing is folded", () => {
    const folds = createFileFoldsState()
    const before = folds.collapsed()
    folds.clear()
    expect(folds.collapsed()).toBe(before)
  })
})
