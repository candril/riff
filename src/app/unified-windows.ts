import { cellOfColumn, columnOfCell } from "../diff-rows/cells"
import type { UnifiedLayout } from "../split-view/unified-layout"
import { unifiedShownCells } from "../split-view/unified-markers"
import type { FlashRegion, FlashWindow } from "../vim-diff/flash-handler"
import type { UnifiedInputs } from "./unified-island"

// The lines unified slides sideways under its single column window.
export const IN_CODE = new Set(["context", "addition", "deletion", "no-newline"])

export const codeWidth = (laid: UnifiedLayout, line: number) => laid.rowWidth() - laid.originOf(line)

export interface UnifiedWindowsSource {
  inputs: () => UnifiedInputs | null
  layout: () => UnifiedLayout | null
  shownTop: () => number
  shownColumn: () => number
  height: () => number
}

/** What of each line unified has on screen, for flash labels and the visible-files readout. */
export function createUnifiedWindows({ inputs, layout, shownTop, shownColumn, height }: UnifiedWindowsSource) {
  /**
   * The visual rows on screen that show a line, top to bottom. The pinned
   * header covers row 0, so whatever is under it is not among them: a flash
   * label there could be pressed without ever being seen.
   */
  function shownRows(): { first: number; last: number } | null {
    const laid = layout()
    if (!inputs() || !laid) return null
    const top = shownTop()
    const first = top + (laid.sticky() === undefined ? 0 : 1)
    const last = Math.min(top + height() - 1, laid.visual().total - 1)
    return first <= last ? { first, last } : null
  }

  /** The columns of a mapping line on screen, in UTF-16 units, `endCol` exclusive. */
  function lineWindow(line: number): FlashWindow {
    const props = inputs()
    const shown = props?.mapping.getLine(line)
    const laid = layout()
    if (!props || !laid || !shown) return { startCol: 0, endCol: 0 }
    const { content } = shown
    if (props.wrap) return wrappedWindow(laid, line, content)
    const width = Math.max(0, codeWidth(laid, line))
    if (!IN_CODE.has(shown.type)) return { startCol: 0, endCol: width }
    const { first, last } = unifiedShownCells(shownColumn(), width, cellOfColumn(content, content.length))
    const startCol = columnOfCell(content, first)
    return { startCol, endCol: last < first ? startCol : columnOfCell(content, last) + 1 }
  }

  // Only the slices on screen: a line cut off at the top, under the pinned header or at the bottom edge
  // is looked at in the part of itself that still shows.
  function wrappedWindow(laid: UnifiedLayout, line: number, content: string): FlashWindow {
    const slices = laid.visual().slicesOf(line)
    const rows = shownRows()
    if (!slices || !rows) return { startCol: 0, endCol: content.length }
    const firstRow = laid.visual().firstOf(line)
    const from = Math.max(0, rows.first - firstRow)
    const to = Math.min(slices.length - 1, rows.last - firstRow)
    if (from > to) return { startCol: 0, endCol: content.length }
    return { startCol: slices[from]!.startCol, endCol: slices[to]!.endCol }
  }

  const lineWindows = (line: number): FlashWindow[] => [lineWindow(line)]

  function visibleLines(): number[] {
    const rows = shownRows()
    const laid = layout()
    if (!rows || !laid) return []
    const visual = laid.visual()
    const from = visual.at(rows.first).row
    const to = visual.at(rows.last).row
    return laid.rows().slice(from, to + 1).flatMap((row) => (row.kind === "line" ? [row.index] : []))
  }

  /**
   * Each line in its own window: a file section's gutter sets where its
   * code starts, so the window differs from one section to the next.
   */
  function visibleRegion(): FlashRegion | null {
    const props = inputs()
    if (!props || !layout()) return null
    return { lines: visibleLines(), ...lineWindow(props.cursor.line), windowsOf: lineWindows }
  }

  /** The files with code on screen, topmost first. */
  function visibleFilenames(): string[] {
    const mapping = inputs()?.mapping
    if (!mapping) return []
    const names = new Set<string>()
    for (const index of visibleLines()) {
      const line = mapping.getLine(index)
      if (line?.filename && IN_CODE.has(line.type)) names.add(line.filename)
    }
    return [...names]
  }

  return { lineWindow, lineWindows, visibleRegion, visibleLines, visibleFilenames }
}
