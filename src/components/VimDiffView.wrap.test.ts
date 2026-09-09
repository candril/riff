import { test, expect, describe } from "bun:test"
import { buildWrapIndex, wrapRowForColumn, type WrapIndex } from "./VimDiffView"
import type { CodeRenderable } from "@opentui/core"

/**
 * The shape opentui actually returns for a wrapped buffer. Taken from a
 * live CodeRenderable rendered at width 18 over:
 *
 *   short
 *   aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa   (30 columns, wraps once)
 *   mid line
 *   bb
 */
const liveLineInfo = {
  lineStartCols: [0, 6, 24, 37, 46],
  lineWidthCols: [5, 18, 12, 8, 2],
  lineSources: [0, 1, 1, 2, 3],
  lineWraps: [0, 0, 1, 0, 0],
}

function codeWith(lineInfo: unknown): CodeRenderable {
  return { lineInfo } as unknown as CodeRenderable
}

describe("buildWrapIndex", () => {
  test("maps every visual row back to its line and column span", () => {
    const index = buildWrapIndex(codeWith(liveLineInfo))!

    expect(index.rows).toBe(5)
    expect(index.sources).toEqual([0, 1, 1, 2, 3])
    // Column offsets are relative to each line, not to the buffer.
    expect(index.startCols).toEqual([0, 0, 18, 0, 0])
    expect(index.widths).toEqual([5, 18, 12, 8, 2])
    expect(index.firstRow).toEqual([0, 1, 3, 4])
  })

  test("is absent when the renderable has not laid out", () => {
    expect(buildWrapIndex(codeWith(undefined))).toBeNull()
    expect(buildWrapIndex(codeWith({ lineSources: [0] }))).toBeNull()
  })
})

describe("wrapRowForColumn", () => {
  const index: WrapIndex = buildWrapIndex(codeWith(liveLineInfo))!

  test("keeps a column on the row that draws it", () => {
    expect(wrapRowForColumn(index, 1, 0)).toEqual({ row: 1, startCol: 0 })
    expect(wrapRowForColumn(index, 1, 17)).toEqual({ row: 1, startCol: 0 })
    expect(wrapRowForColumn(index, 1, 18)).toEqual({ row: 2, startCol: 18 })
    expect(wrapRowForColumn(index, 1, 29)).toEqual({ row: 2, startCol: 18 })
  })

  test("holds the last row for a column past the end of the line", () => {
    expect(wrapRowForColumn(index, 1, 400)).toEqual({ row: 2, startCol: 18 })
  })

  test("puts unwrapped lines on their own single row", () => {
    expect(wrapRowForColumn(index, 0, 3)).toEqual({ row: 0, startCol: 0 })
    expect(wrapRowForColumn(index, 3, 1)).toEqual({ row: 4, startCol: 0 })
  })

  test("falls back to one row per line without an index", () => {
    expect(wrapRowForColumn(null, 7, 120)).toEqual({ row: 7, startCol: 0 })
  })

  test("falls back for a line the index does not cover", () => {
    expect(wrapRowForColumn(index, 99, 4)).toEqual({ row: 99, startCol: 0 })
  })
})
