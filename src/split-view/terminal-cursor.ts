import type { Renderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createEffect, createMemo, on, onCleanup } from "solid-js"
import { cellOfColumn } from "../diff-rows/cells"
import type { VisualRows } from "../diff-rows/visual-rows"
import type { DiffLine, DiffLineType } from "../vim-diff/types"
import { FILE_LABEL_PATH_X } from "./FullRow"

export interface CursorCell {
  x: number
  y: number
}

export interface CursorCellInput {
  line: DiffLine | undefined
  /** The line's index in the mapping, which in unified is its row's. */
  lineIndex: number
  /** A UTF-16 column of the line, as the vim cursor keeps it. */
  col: number
  scrollTop: number
  height: number
  /** The sideways offset in cells; wrapped lines have no use for it. */
  column: number
  origin: number
  rowWidth: number
  visual: Pick<VisualRows, "ofColumn">
}

// Drawn from the code's origin whatever the sideways offset, so the cursor stays put with them.
// Not hunk headers: UnifiedLine draws them as code that scrolls sideways, so the cursor follows them like any code line.
const FIXED_TYPES = new Set<DiffLineType>(["divider", "spacing"])

/**
 * The cell, from the view's top-left, the terminal's cursor goes on; null
 * where it must be hidden. Counted in cells as the rows draw them, so a tab
 * or a wide character puts it where the character actually is.
 */
export function unifiedCursorCell(input: CursorCellInput): CursorCell | null {
  const { line } = input
  if (!line) return null
  // A column in whitespace hanging past a wrapped row's edge goes to the next slice, as VimDiffView places it.
  const { visual, slice } = input.visual.ofColumn(input.lineIndex, input.col)
  const y = visual - input.scrollTop
  if (y < 0 || y >= input.height) return null
  const x = cursorX(input, line, slice?.startCell)
  return x === null || x >= input.rowWidth ? null : { x, y }
}

function cursorX(input: CursorCellInput, line: DiffLine, sliceStart: number | undefined): number | null {
  if (line.type === "file-header") {
    // On the path, where split's header block goes: a column past it stays on its last character.
    const filename = line.filename ?? ""
    return FILE_LABEL_PATH_X + cellOfColumn(filename, Math.max(0, Math.min(input.col, filename.length - 1)))
  }
  const cell = cellOfColumn(line.content, input.col)
  if (FIXED_TYPES.has(line.type)) return input.origin + cell
  const shown = cell - (sliceStart ?? input.column)
  return shown < 0 ? null : input.origin + shown
}

const sameCell = (a: CursorCell | null, b: CursorCell | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y)

/**
 * A renderAfter hook that puts the terminal's block cursor on `cell` of the
 * box it is set on. Unfocused, it leaves the cursor alone: whatever has
 * focus, a composer's textarea say, owns it then.
 */
export function createTerminalCursor(focused: () => boolean, cell: () => CursorCell | null) {
  const renderer = useRenderer()
  const at = createMemo(cell, null, { equals: sameCell })
  // A move that changes no segment, sideways on the same line, would otherwise wait for an unrelated frame.
  createEffect(on([at, focused], () => renderer.requestRender(), { defer: true }))
  // Otherwise the block stays wherever the view last put it, over whatever replaces the view.
  onCleanup(() => renderer.setCursorPosition(0, 0, false))
  return function placeCursor(this: Renderable) {
    if (!focused()) return
    const target = at()
    if (!target) return renderer.setCursorPosition(0, 0, false)
    renderer.setCursorStyle({ style: "block", blinking: false })
    // The terminal counts from 1.
    renderer.setCursorPosition(this.x + target.x + 1, this.y + target.y + 1, true)
  }
}
