import { describe, expect, test } from "bun:test"
import { buildSegments } from "../diff-rows/segments"
import { cellCount, cellOfColumn, columnOfCell, visibleCells } from "../split-view/layout"
import { theme } from "../theme"
import { clampCursorCell, halfWindow, revealColumn, scrollBy, toEdge } from "./split-columns"

const drawnCells = (text: string) => cellCount(buildSegments(text, { wordSide: "added", baseFg: theme.text, rowBg: theme.base }))

describe("cells and columns", () => {
  test("a tab is two cells and a surrogate pair one, as the half draws them", () => {
    const line = "\tif (😀) x"
    expect(cellOfColumn(line, 0)).toBe(0)
    expect(cellOfColumn(line, 1)).toBe(2)
    expect(cellOfColumn(line, 5)).toBe(6)
    expect(cellOfColumn(line, 6)).toBe(6)
    expect(cellOfColumn(line, 7)).toBe(7)
    expect(cellOfColumn(line, line.length)).toBe(drawnCells(line))
    expect(columnOfCell(line, 0)).toBe(0)
    expect(columnOfCell(line, 1)).toBe(0)
    expect(columnOfCell(line, 2)).toBe(1)
    expect(columnOfCell(line, 6)).toBe(5)
    expect(columnOfCell(line, 7)).toBe(7)
  })

  test("past the end, and on an empty line, each column is a cell", () => {
    expect(cellOfColumn("", 0)).toBe(0)
    expect(cellOfColumn("", 3)).toBe(3)
    expect(cellOfColumn("\t", 2)).toBe(3)
    expect(columnOfCell("", 4)).toBe(4)
    expect(columnOfCell("\t", 3)).toBe(2)
  })
})

describe("visibleCells", () => {
  test("a line that fits shows the whole window", () => {
    expect(visibleCells(0, 10, 10)).toEqual({ first: 0, last: 9 })
  })

  test("a marker takes the first cell once scrolled, and the last while the line runs on", () => {
    expect(visibleCells(0, 10, 30)).toEqual({ first: 0, last: 8 })
    expect(visibleCells(5, 10, 30)).toEqual({ first: 6, last: 13 })
    expect(visibleCells(20, 10, 30)).toEqual({ first: 21, last: 29 })
  })

  test("an empty line has no markers, and a window past a short line still marks its left edge", () => {
    expect(visibleCells(5, 10, 0)).toEqual({ first: 5, last: 14 })
    expect(visibleCells(40, 10, 3)).toEqual({ first: 41, last: 49 })
  })
})

describe("revealColumn", () => {
  test("a cursor inside the margins leaves the window alone", () => {
    expect(revealColumn(0, 20, 50, 200)).toBe(0)
  })

  test("past the right edge, the window keeps eight cells beyond the cursor", () => {
    expect(revealColumn(0, 60, 50, 200)).toBe(60 - 50 + 1 + 8)
  })

  test("before the left edge, eight cells before it, and never below zero", () => {
    expect(revealColumn(40, 30, 50, 200)).toBe(22)
    expect(revealColumn(40, 3, 50, 200)).toBe(0)
  })

  test("a narrow pane spares less margin, and the cursor never ends up under a marker", () => {
    // Four cells: a margin of one.
    expect(revealColumn(0, 3, 4, 20)).toBe(1)
    expect(visibleCells(1, 4, 20)).toEqual({ first: 2, last: 3 })
    // Three cells spare no margin, so the window takes a step more to clear the `›`.
    const right = revealColumn(0, 5, 3, 20)
    const shown = visibleCells(right, 3, 20)
    expect(5).toBeGreaterThanOrEqual(shown.first)
    expect(5).toBeLessThanOrEqual(shown.last)
    // And on the way back, to clear the `‹`.
    const left = revealColumn(10, 9, 3, 20)
    const back = visibleCells(left, 3, 20)
    expect(9).toBeGreaterThanOrEqual(back.first)
    expect(9).toBeLessThanOrEqual(back.last)
  })

  test("a window past a short line comes back to its cursor", () => {
    expect(revealColumn(80, 2, 50, 3)).toBe(0)
  })

  test("a pane with no width does nothing", () => {
    expect(revealColumn(7, 100, 0, 200)).toBe(7)
  })
})

describe("explicit scrolls", () => {
  test("scrollBy stops at the first column", () => {
    expect(scrollBy(3, 5)).toBe(8)
    expect(scrollBy(3, -5)).toBe(0)
  })

  test("zs and ze put the cursor beside the edge's marker", () => {
    expect(toEdge(30, 10, "start", 100)).toBe(29)
    expect(visibleCells(29, 10, 100).first).toBe(30)
    expect(toEdge(30, 10, "end", 100)).toBe(22)
    expect(visibleCells(22, 10, 100).last).toBe(30)
    // At the line's end there is no `›` to step around.
    expect(toEdge(99, 10, "end", 100)).toBe(90)
    expect(toEdge(4, 10, "end", 100)).toBe(0)
  })

  test("halfWindow is half the pane, at least one cell", () => {
    expect(halfWindow(51)).toBe(25)
    expect(halfWindow(1)).toBe(1)
  })

  test("clampCursorCell drags the cursor to the nearest visible cell, never past the line's end", () => {
    expect(clampCursorCell(10, 10, 2, 100)).toBe(11)
    expect(clampCursorCell(10, 10, 50, 100)).toBe(18)
    expect(clampCursorCell(10, 10, 14, 100)).toBe(14)
    expect(clampCursorCell(40, 10, 2, 5)).toBe(4)
    expect(clampCursorCell(0, 10, 0, 0)).toBe(0)
  })
})
