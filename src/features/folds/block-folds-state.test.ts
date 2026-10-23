import { describe, expect, test } from "bun:test"
import { createBlockFoldsState } from "./block-folds-state"

describe("createBlockFoldsState", () => {
  test("starts with nothing folded", () => {
    const folds = createBlockFoldsState()
    expect([...folds.collapsed()]).toEqual([])
    expect(folds.isCollapsed("a.md:0")).toBe(false)
  })

  test("toggle folds a block and a second toggle unfolds it", () => {
    const folds = createBlockFoldsState()
    folds.toggle("a.md:0")
    expect(folds.isCollapsed("a.md:0")).toBe(true)
    folds.toggle("a.md:0")
    expect(folds.isCollapsed("a.md:0")).toBe(false)
  })

  test("toggle leaves the other folded blocks alone", () => {
    const folds = createBlockFoldsState()
    folds.toggle("a.md:0")
    folds.toggle("a.md:1")
    folds.toggle("a.md:0")
    expect([...folds.collapsed()]).toEqual(["a.md:1"])
  })

  test("set replaces every folded block", () => {
    const folds = createBlockFoldsState()
    folds.toggle("a.md:0")
    folds.set(["b.md:0", "b.md:1"])
    expect([...folds.collapsed()].sort()).toEqual(["b.md:0", "b.md:1"])
    expect(folds.isCollapsed("a.md:0")).toBe(false)
  })

  test("clear unfolds every block", () => {
    const folds = createBlockFoldsState()
    folds.set(["a.md:0", "b.md:0"])
    folds.clear()
    expect(folds.collapsed().size).toBe(0)
  })

  test("clear keeps the set when nothing is folded", () => {
    const folds = createBlockFoldsState()
    const before = folds.collapsed()
    folds.clear()
    expect(folds.collapsed()).toBe(before)
  })
})
