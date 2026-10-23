import { describe, expect, test } from "bun:test"
import { createDiffOptionsState, type DiffOptionsState } from "./options-state"

const shape = (o: DiffOptionsState) => ({
  wrapLines: o.wrapLines(),
  splitView: o.splitView(),
  alignMarkdownTables: o.alignMarkdownTables(),
})

describe("createDiffOptionsState", () => {
  test("takes wrap and table alignment from its seed and starts unsplit", () => {
    expect(shape(createDiffOptionsState({ wrap: true, alignMarkdownTables: false }))).toEqual({
      wrapLines: true,
      splitView: false,
      alignMarkdownTables: false,
    })
  })

  test("toggleWrap flips only wrap", () => {
    const o = createDiffOptionsState({ wrap: false, alignMarkdownTables: true })
    o.toggleWrap()
    expect(shape(o)).toEqual({ wrapLines: true, splitView: false, alignMarkdownTables: true })
    o.toggleWrap()
    expect(o.wrapLines()).toBe(false)
  })

  test("toggleSplit flips only the split", () => {
    const o = createDiffOptionsState({ wrap: false, alignMarkdownTables: true })
    o.toggleSplit()
    expect(shape(o)).toEqual({ wrapLines: false, splitView: true, alignMarkdownTables: true })
    o.toggleSplit()
    expect(o.splitView()).toBe(false)
  })
})
