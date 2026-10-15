import { test, expect, describe } from "bun:test"
import { doc } from "../diff-rows/fixtures"
import { RowLineSource } from "../diff-rows/row-source"
import type { Side } from "../diff-rows/rows"
import { createCursorState } from "../vim-diff/cursor-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { VimMode } from "../vim-diff/types"
import { splitSelection } from "./split-selection"

/** Rows as split-cursor.test.ts reads them: 5 adds with an empty left half; 8 pairs line 8 with 11, 9 pairs 9 with 12. */
const mapping = new DiffLineMapping([doc], "all")
const source = (side: Side) => new RowLineSource(mapping, "split", side)
const state = (mode: VimMode, line: number, col: number, anchor: number, anchorCol: number) => ({
  ...createCursorState(),
  mode,
  line,
  col,
  selectionAnchor: anchor,
  selectionAnchorCol: anchorCol,
})

describe("a selection over split rows", () => {
  test("an anchor below the cursor ends the selection", () => {
    expect(splitSelection(state("visual", 2, 3, 12, 1), source("right"))).toEqual({
      mode: "visual",
      startRow: 2,
      startCol: 3,
      endRow: 9,
      endCol: 1,
    })
  })

  test("rows decide the order, where the mapping would put a removal before the addition above it", () => {
    // Line 9 comes before line 11 in the mapping, but its row is the one below.
    expect(splitSelection(state("visual", 9, 0, 11, 4), source("left"))).toEqual({
      mode: "visual",
      startRow: 8,
      startCol: 4,
      endRow: 9,
      endCol: 0,
    })
  })

  test("an anchor on the other half of the cursor's row is the same row, so the columns decide", () => {
    expect(splitSelection(state("visual", 11, 2, 8, 4), source("right"))).toMatchObject({
      startRow: 8,
      startCol: 2,
      endRow: 8,
      endCol: 4,
    })
  })

  test("a row whose active half is empty still bounds the selection", () => {
    // Row 5's only line is on the right; with the left pane active the cursor still sits on that row.
    expect(splitSelection(state("visual-line", 5, 0, 2, 0), source("left"))).toEqual({
      mode: "visual-line",
      startRow: 2,
      startCol: 0,
      endRow: 5,
      endCol: 0,
    })
    expect(splitSelection(state("visual", 2, 1, 5, 0), source("left"))).toMatchObject({ startRow: 2, endRow: 5 })
  })

  test("outside visual mode there is none", () => {
    expect(splitSelection(state("normal", 2, 0, 5, 0), source("right"))).toBeNull()
  })
})
