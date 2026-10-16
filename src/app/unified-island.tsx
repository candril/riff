import type { CliRenderer } from "@opentui/core"
import { Show, batch, createSignal, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { cellOfColumn, columnOfCell } from "../diff-rows/cells"
import { UnifiedDiffView, type UnifiedDiffViewProps } from "../split-view/UnifiedDiffView"
import { createUnifiedLayout, type UnifiedLayout } from "../split-view/unified-layout"
import { unifiedShownCells } from "../split-view/unified-markers"
import type { FlashRegion, FlashWindow } from "../vim-diff/flash-handler"
import { mountSolid } from "./solid-island"
import { clampCursorCell, halfWindow, revealColumn, scrollBy, toEdge } from "./split-columns"
import { placeRow, revealRow } from "./split-scroll"

export type UnifiedInputs = Omit<UnifiedDiffViewProps, "scrollTop" | "column" | "width" | "height" | "layout">

// The lines unified slides sideways under its single column window.
const IN_CODE = new Set(["context", "addition", "deletion", "no-newline"])

/**
 * The unified view as a long-lived island, split's counterpart. It owns
 * the vertical scroll, in visual rows, and the one sideways column every
 * line shares, in cells, and answers what the app asks of the viewport
 * from the very rows the view draws.
 */
export function createUnifiedIsland(renderer: CliRenderer, scrollOff: number) {
  const [inputs, setInputs] = createStore<{ value: UnifiedInputs | null }>({ value: null })
  const [size, setSize] = createSignal({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = createSignal(0)
  const [column, setColumn] = createSignal(0)
  let layout: UnifiedLayout | null = null

  function LaidOut(props: Omit<UnifiedDiffViewProps, "layout">) {
    const own = createUnifiedLayout(props)
    layout = own
    onCleanup(() => {
      if (layout === own) layout = null
    })
    return <UnifiedDiffView {...props} layout={own} />
  }

  const island = mountSolid(
    renderer,
    () => (
      <Show when={inputs.value}>
        {(props: () => UnifiedInputs) => (
          <LaidOut
            {...props()}
            scrollTop={scrollTop()}
            column={column()}
            width={size().width}
            height={size().height}
          />
        )}
      </Show>
    ),
    // A deferred resize leaves one frame drawn at the old size; clipping keeps it off the prompt row.
    { width: "100%", height: "100%", overflow: "hidden" }
  )

  const window = () => ({ scrollTop: scrollTop(), height: size().height, rows: layout?.visual().total ?? 0 })

  /** The visual row the cursor's column is drawn on, -1 before there is anything to draw. */
  function cursorRow(): number {
    const props = inputs.value
    if (!props || !layout) return -1
    return layout.visual().ofColumn(props.cursor.line, props.cursor.col).visual
  }

  function ensureCursorVisible(): void {
    const row = cursorRow()
    if (row >= 0) setScrollTop(revealRow(window(), row, scrollOff))
  }

  const codeWidth = (laid: UnifiedLayout, line: number) => laid.rowWidth() - laid.originOf(line)

  /**
   * The cursor's line and the room its row has for code. Null while
   * wrapped, where nothing scrolls sideways, and on riff's own rows, which
   * stay where they are drawn.
   */
  function cursorCode() {
    const props = inputs.value
    if (!props || !layout || props.wrap) return null
    const shown = props.mapping.getLine(props.cursor.line)
    if (!shown || !IN_CODE.has(shown.type)) return null
    const { content } = shown
    return {
      content,
      width: codeWidth(layout, props.cursor.line),
      cells: cellOfColumn(content, content.length),
      cursorCell: cellOfColumn(content, props.cursor.col),
    }
  }

  /**
   * The visual rows on screen that show a line, top to bottom. The pinned
   * header covers row 0, so whatever is under it is not among them: a flash
   * label there could be pressed without ever being seen.
   */
  function shownRows(): { first: number; last: number } | null {
    if (!inputs.value || !layout) return null
    const top = scrollTop()
    const first = top + (layout.sticky() === undefined ? 0 : 1)
    const last = Math.min(top + size().height - 1, layout.visual().total - 1)
    return first <= last ? { first, last } : null
  }

  /** The columns of a mapping line on screen, in UTF-16 units, `endCol` exclusive. */
  function lineWindow(line: number): FlashWindow {
    const props = inputs.value
    const shown = props?.mapping.getLine(line)
    if (!props || !layout || !shown) return { startCol: 0, endCol: 0 }
    const { content } = shown
    if (props.wrap) return wrappedWindow(layout, line, content)
    const width = Math.max(0, codeWidth(layout, line))
    if (!IN_CODE.has(shown.type)) return { startCol: 0, endCol: width }
    const { first, last } = unifiedShownCells(column(), width, cellOfColumn(content, content.length))
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
    if (!rows || !layout) return []
    const visual = layout.visual()
    const from = visual.at(rows.first).row
    const to = visual.at(rows.last).row
    return layout.rows().slice(from, to + 1).flatMap((row) => (row.kind === "line" ? [row.index] : []))
  }

  function resize(width: number, height: number): void {
    if (width === size().width && height === size().height) return
    setSize({ width, height })
    // Until the window has a height nothing can be revealed in it.
    ensureCursorVisible()
  }
  // onSizeChange fires inside the layout pass, after the frame's texts are composed:
  // texts rebuilt there would draw empty, so the new size lands in the next frame.
  let disposed = false
  island.host.onSizeChange = () => {
    setTimeout(() => {
      if (disposed) return
      resize(island.host.width, island.host.height)
      renderer.requestRender()
    }, 0)
  }

  return {
    host: island.host,
    /**
     * Class instances (mapping, lineSpans) are handed over by reference:
     * reconcile would walk into them. The plain cursor and selection are
     * rebuilt every render and reconciled, so an unchanged one notifies
     * nothing; search and flash are the app's own state objects, which
     * only change when they are replaced.
     */
    update(next: Partial<UnifiedInputs>) {
      const current = inputs.value
      if (!current) {
        // Only a full set of inputs can draw; the app sends one before anything partial.
        if (next.mapping) setInputs("value", next as UnifiedInputs)
        return
      }
      const { cursor, selection, ...byReference } = next
      // Read before the merge: the store hands back the same object, already carrying the new mapping.
      const remapped = byReference.mapping !== undefined && byReference.mapping !== current.mapping
      batch(() => {
        setInputs("value", byReference)
        if (cursor) setInputs("value", "cursor", reconcile(cursor))
        if (selection !== undefined) setInputs("value", "selection", selection && reconcile(selection))
        // A fold or an expansion rebuilds the mapping; the window must still fit its rows.
        if (remapped) ensureCursorVisible()
      })
    },
    ensureCursorVisible,
    cursorRow,
    scrollTop,
    scrollCursorTo(where: "center" | "top" | "bottom") {
      const row = cursorRow()
      if (row >= 0) setScrollTop(placeRow(window(), row, where, scrollOff))
    },
    // The cursor's block takes a cell past the line's end, and the line owns that cell too.
    revealColumn() {
      const code = cursorCode()
      if (!code) return
      const cells = Math.max(code.cells, code.cursorCell + 1)
      setColumn(revealColumn(column(), code.cursorCell, code.width, cells, unifiedShownCells))
    },
    // One window for every line, so it moves from any line the cursor is on, a header's too.
    scrollColumnsBy(delta: number) {
      if (inputs.value && !inputs.value.wrap) setColumn(scrollBy(column(), delta))
    },
    scrollColumnToEdge(edge: "start" | "end") {
      const code = cursorCode()
      if (code) setColumn(toEdge(code.cursorCell, code.width, edge, code.cells, unifiedShownCells))
    },
    halfColumnWindow(): number {
      const props = inputs.value
      const width = props && layout ? codeWidth(layout, props.cursor.line) : 0
      return halfWindow(width > 0 ? width : 2)
    },
    /** The column nearest `col` that the window shows. */
    clampCursorColumn(col: number): number {
      const code = cursorCode()
      if (!code) return col
      const cell = clampCursorCell(column(), code.width, cellOfColumn(code.content, col), code.cells, unifiedShownCells)
      return columnOfCell(code.content, cell)
    },
    /** The status bar's readout, both numbers in cells, only for a line too wide for its window. */
    columnStatus(): { col: number; total: number } | null {
      const code = cursorCode()
      if (!code || code.cells === 0 || code.cells <= code.width) return null
      return { col: code.cursorCell + 1, total: code.cells }
    },
    resetColumns: () => setColumn(0),
    lineWindow,
    lineWindows,
    /**
     * Each line in its own window: a file section's gutter sets where its
     * code starts, so the window differs from one section to the next.
     */
    visibleRegion(): FlashRegion | null {
      const props = inputs.value
      if (!props || !layout) return null
      return { lines: visibleLines(), ...lineWindow(props.cursor.line), windowsOf: lineWindows }
    },
    visibleLines,
    /** The files with code on screen, topmost first. */
    visibleFilenames(): string[] {
      const mapping = inputs.value?.mapping
      if (!mapping) return []
      const names = new Set<string>()
      for (const index of visibleLines()) {
        const line = mapping.getLine(index)
        if (line?.filename && IN_CODE.has(line.type)) names.add(line.filename)
      }
      return [...names]
    },
    /**
     * The host is only laid out once it is in the tree, a frame after
     * unified is first drawn; a size given up front lets that frame draw
     * rows instead of an empty pane.
     */
    seedSize: resize,
    viewportHeight: () => size().height,
    width: () => size().width,
    dispose() {
      disposed = true
      island.dispose()
    },
  }
}

export type UnifiedIsland = ReturnType<typeof createUnifiedIsland>
