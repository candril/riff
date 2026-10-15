import { test, expect, describe } from "bun:test"
import { doc } from "../diff-rows/fixtures"
import { RowLineSource } from "../diff-rows/row-source"
import type { Side } from "../diff-rows/rows"
import { createCursorState } from "../vim-diff/cursor-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { lineOfRow, paneOfLine, rowOfLine, toLineState, toRowSelection, toRowState } from "./split-cursor"

/** Rows as row-source.test.ts lays them out: 2 is context, 5 adds with an empty left half, 8 pairs a removal with an addition. */
const mapping = new DiffLineMapping([doc], "all")
const source = (side: Side) => new RowLineSource(mapping, "split", side)
const pair = (row: number) => source("left").rows[row] as { kind: "pair"; left?: number; right?: number }

describe("a row and the mapping line behind it", () => {
  test("a context row is the same line from either side", () => {
    for (const side of ["left", "right"] as const) {
      const line = lineOfRow(2, source(side))
      expect(mapping.getLineContent(line)).toBe("intro")
      expect(rowOfLine(line, source(side))).toBe(2)
    }
  })

  test("a removal pairs with its addition, and each side reads its own half", () => {
    const { left, right } = pair(8)
    expect(mapping.getLine(left!)?.type).toBe("deletion")
    expect(mapping.getLine(right!)?.type).toBe("addition")
    expect(lineOfRow(8, source("left"))).toBe(left!)
    expect(lineOfRow(8, source("right"))).toBe(right!)
    expect(rowOfLine(left!, source("right"))).toBe(8)
    expect(rowOfLine(right!, source("left"))).toBe(8)
  })

  test("an empty half reads the line in the other half, so the row survives the round trip", () => {
    const { left, right } = pair(5)
    expect(left).toBeUndefined()
    expect(lineOfRow(5, source("left"))).toBe(right!)
    expect(lineOfRow(5, source("right"))).toBe(right!)
    expect(rowOfLine(lineOfRow(5, source("left")), source("left"))).toBe(5)
  })

  test("every row round-trips on both sides", () => {
    for (const side of ["left", "right"] as const) {
      const rows = source(side)
      for (let row = 0; row < rows.lineCount; row++) {
        expect(rowOfLine(lineOfRow(row, rows), rows)).toBe(row)
      }
    }
  })
})

describe("the cursor state", () => {
  test("line and selection anchor convert; columns pass through", () => {
    const { left, right } = pair(8)
    const lines = { ...createCursorState(), line: right!, col: 4, desiredCol: 7, selectionAnchor: 2, selectionAnchorCol: 1 }

    const rows = toRowState(lines, source("right"))
    expect(rows).toMatchObject({ line: 8, col: 4, desiredCol: 7, selectionAnchor: rowOfLine(2, source("right")), selectionAnchorCol: 1 })

    expect(toLineState(rows, source("right"), lines)).toMatchObject({ line: right!, selectionAnchor: 2, col: 4 })
    // h and l cross panes by switching the side under the same row.
    expect(toLineState(rows, source("left"), lines).line).toBe(left!)
  })

  test("a selection converts on its own, carrying nothing but what it is read from", () => {
    const { left, right } = pair(8)
    const lines = {
      ...createCursorState(),
      mode: "visual" as const,
      line: right!,
      col: 3,
      selectionAnchor: left!,
      selectionAnchorCol: 1,
      jumpList: [right!],
    }
    expect(toRowSelection(lines, source("right"))).toEqual({
      mode: "visual",
      line: 8,
      col: 3,
      selectionAnchor: 8,
      selectionAnchorCol: 1,
    })
    expect(toRowSelection(createCursorState(), source("right")).selectionAnchor).toBeNull()
  })

  test("no selection stays no selection", () => {
    const state = createCursorState()
    expect(toRowState(state, source("right")).selectionAnchor).toBeNull()
    expect(toLineState(state, source("right"), state).selectionAnchor).toBeNull()
  })

  test("jumps and marks are kept in lines too", () => {
    const { right } = pair(8)
    const lines = { ...createCursorState(), jumpList: [right!, 2], marks: new Map([["a", right!]]) }
    const rows = toRowState(lines, source("right"))
    expect(rows.jumpList).toEqual([8, 2])
    expect(rows.marks.get("a")).toBe(8)
    const back = toLineState(rows, source("right"), lines)
    expect(back.jumpList).toEqual([right!, 2])
    expect(back.marks.get("a")).toBe(right!)
  })

  // Set in unified on a removed line, then a `j` in the new pane.
  test("a mark and a jump on the inactive half keep their line through a motion", () => {
    const { left, right } = pair(8)
    const lines = { ...createCursorState(), line: right!, jumpList: [left!], jumpIndex: 0, marks: new Map([["a", left!]]) }
    const rows = source("right")
    const moved = { ...toRowState(lines, rows), line: 9 }
    const back = toLineState(moved, rows, lines)
    expect(back.marks.get("a")).toBe(left!)
    expect(back.jumpList).toEqual([left!])
    expect(back.line).toBe(lineOfRow(9, rows))
  })

  test("a jump the handler pushes is the cursor's line, even off the active side", () => {
    const { left } = pair(8)
    const lines = { ...createCursorState(), line: left!, jumpList: [2], jumpIndex: 0 }
    const rows = source("right")
    const before = toRowState(lines, rows)
    const pushed = { ...before, line: 0, jumpList: [...before.jumpList, before.line], jumpIndex: 1 }
    expect(toLineState(pushed, rows, lines).jumpList).toEqual([2, left!])
  })

  test("a jump list trimmed at the front keeps each surviving line", () => {
    const { left } = pair(8)
    const lines = { ...createCursorState(), line: 2, jumpList: [0, left!], jumpIndex: 1 }
    const rows = source("right")
    const before = toRowState(lines, rows)
    const trimmed = { ...before, jumpList: [...before.jumpList.slice(1), before.line] }
    expect(toLineState(trimmed, rows, lines).jumpList).toEqual([left!, 2])
  })
})

describe("the pane a line asks for", () => {
  test("a half of a two-sided pair asks for its own pane when the other is active", () => {
    const { left, right } = pair(8)
    expect(paneOfLine(left!, source("right"))).toBe("left")
    expect(paneOfLine(right!, source("left"))).toBe("right")
    expect(paneOfLine(left!, source("left"))).toBeNull()
  })

  test("context and a line facing an empty half leave the pane where it is", () => {
    const { right } = pair(5)
    expect(paneOfLine(lineOfRow(2, source("left")), source("left"))).toBeNull()
    expect(paneOfLine(right!, source("left"))).toBeNull()
  })
})
