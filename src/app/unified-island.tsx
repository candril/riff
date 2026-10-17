import type { CliRenderer } from "@opentui/core"
import { Show, batch, createSignal, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { cellOfColumn, columnOfCell } from "../diff-rows/cells"
import { UnifiedDiffView, type UnifiedDiffViewProps } from "../split-view/UnifiedDiffView"
import { createUnifiedLayout, type UnifiedLayout } from "../split-view/unified-layout"
import { unifiedShownCells } from "../split-view/unified-markers"
import { diffWheel } from "./diff-wheel"
import { mountSolid } from "./solid-island"
import { clampCursorCell, halfWindow, revealColumn, scrollBy, toEdge } from "./split-columns"
import { clampScroll, placeRow, revealRow } from "./split-scroll"
import { EmptyMessage, isEmpty } from "./unified-empty"
import { draggedLine } from "./unified-wheel"
import { IN_CODE, codeWidth, createUnifiedWindows } from "./unified-windows"

export type UnifiedInputs = Omit<UnifiedDiffViewProps, "scrollTop" | "column" | "width" | "height" | "layout"> & {
  /** Drawn in place of a diff with no lines: why it is empty, a tree filter's or no changes at all. */
  emptyMessage: string
}

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
  // A signal, so the clamped scroll handed to the layout follows the layout's own row count once it exists.
  const [layout, setLayout] = createSignal<UnifiedLayout | null>(null)
  let onCursorScrolledAway: ((line: number) => void) | null = null

  function LaidOut(props: Omit<UnifiedDiffViewProps, "layout">) {
    const own = createUnifiedLayout(props)
    setLayout(own)
    onCleanup(() => {
      if (layout() === own) setLayout(null)
    })
    return <UnifiedDiffView {...props} layout={own} />
  }

  // A remap, a wrap toggle or a resize can leave the stored scroll past the last row; nothing reads it unclamped.
  const shownTop = () =>
    clampScroll({ scrollTop: scrollTop(), height: size().height, rows: layout()?.visual().total ?? 0 })
  const window = () => ({ scrollTop: shownTop(), height: size().height, rows: layout()?.visual().total ?? 0 })

  /**
   * The window stops sideways at the widest row's right edge, so zl
   * past it stops rather than scrolling into blank space, which tells
   * the reader there is nothing further right. The content counts a cell
   * past every line's end, so the cursor's block there still shows at the
   * stop and a reveal never needs to go further.
   */
  const maxColumn = () => {
    const laid = layout()
    return laid ? Math.max(0, laid.contentWidth() - laid.rowWidth()) : 0
  }
  const shownColumn = () => Math.min(column(), maxColumn())
  const moveColumn = (next: number) => setColumn(Math.max(0, Math.min(next, maxColumn())))
  const windows = createUnifiedWindows({
    inputs: () => inputs.value,
    layout,
    shownTop,
    shownColumn,
    height: () => size().height,
  })

  const island = mountSolid(
    renderer,
    () => (
      <Show when={inputs.value}>
        {(props: () => UnifiedInputs) => (
          <Show when={!isEmpty(props())} fallback={<EmptyMessage text={props().emptyMessage} />}>
            <LaidOut
              {...props()}
              scrollTop={shownTop()}
              column={shownColumn()}
              width={size().width}
              height={size().height}
            />
          </Show>
        )}
      </Show>
    ),
    // A deferred resize leaves one frame drawn at the old size; clipping keeps it off the prompt row.
    { width: "100%", height: "100%", overflow: "hidden" }
  )

  /** The visual row the cursor's column is drawn on, -1 before there is anything to draw. */
  function cursorRow(): number {
    const props = inputs.value
    const laid = layout()
    if (!props || !laid) return -1
    return laid.visual().ofColumn(props.cursor.line, props.cursor.col).visual
  }

  function ensureCursorVisible(): void {
    const row = cursorRow()
    if (row >= 0) setScrollTop(revealRow(window(), row, scrollOff))
  }

  // Only the wheel moves the window out from under the cursor: every reveal of riff's own keeps it inside.
  function dragCursorIntoView(): void {
    const props = inputs.value
    const laid = layout()
    if (!props || !laid || !onCursorScrolledAway) return
    const line = draggedLine(laid, window(), { line: props.cursor.line, row: cursorRow() }, scrollOff)
    if (line !== null) onCursorScrolledAway(line)
  }

  // Rows bubble the wheel to the host, held ones too: the hit grid names a row a tick scrolled away until the next frame.
  island.host.onMouseScroll = diffWheel({
    rows(delta) {
      layout()?.held.hold(window())
      setScrollTop(clampScroll({ ...window(), scrollTop: shownTop() + delta }))
      dragCursorIntoView()
    },
    columns(delta) {
      if (inputs.value && !inputs.value.wrap) moveColumn(shownColumn() + delta)
    },
  })

  /**
   * The cursor's line and the room its row has for code. Null while
   * wrapped, where nothing scrolls sideways, and on riff's own rows, which
   * stay where they are drawn.
   */
  function cursorCode() {
    const props = inputs.value
    const laid = layout()
    if (!props || !laid || props.wrap) return null
    const shown = props.mapping.getLine(props.cursor.line)
    if (!shown || !IN_CODE.has(shown.type)) return null
    const { content } = shown
    return {
      content,
      width: codeWidth(laid, props.cursor.line),
      cells: cellOfColumn(content, content.length),
      cursorCell: cellOfColumn(content, props.cursor.col),
    }
  }

  // The cursor's block takes a cell past the line's end, and the line owns that cell too.
  function revealCursorColumn(): void {
    const code = cursorCode()
    if (!code) return
    const cells = Math.max(code.cells, code.cursorCell + 1)
    moveColumn(revealColumn(shownColumn(), code.cursorCell, code.width, cells, unifiedShownCells))
  }

  function resize(width: number, height: number): void {
    if (width === size().width && height === size().height) return
    setSize({ width, height })
    // Until the window has a height nothing can be revealed in it.
    ensureCursorVisible()
    revealCursorColumn()
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
      const rewrapped = byReference.wrap !== undefined && byReference.wrap !== current.wrap
      batch(() => {
        setInputs("value", byReference)
        if (cursor) setInputs("value", "cursor", reconcile(cursor))
        if (selection !== undefined) setInputs("value", "selection", selection && reconcile(selection))
        // A fold or an expansion rebuilds the mapping; the window must still fit its rows.
        if (remapped) ensureCursorVisible()
      })
      // Wrap changes how many rows there are without a remap; storing the clamp keeps a toggle back from restoring it.
      if (rewrapped) {
        setScrollTop(shownTop())
        setColumn(shownColumn())
      }
    },
    /** Told the line the cursor is dragged to when the wheel scrolls the window out from under it. */
    setOnCursorScrolledAway(cb: (line: number) => void) {
      onCursorScrolledAway = cb
    },
    ensureCursorVisible,
    cursorRow,
    scrollTop: shownTop,
    scrollCursorTo(where: "center" | "top" | "bottom") {
      const row = cursorRow()
      if (row >= 0) setScrollTop(placeRow(window(), row, where, scrollOff))
    },
    revealColumn: revealCursorColumn,
    // One window for every line, so it moves from any line the cursor is on, a header's too.
    scrollColumnsBy(delta: number) {
      if (inputs.value && !inputs.value.wrap) moveColumn(scrollBy(shownColumn(), delta))
    },
    scrollColumnToEdge(edge: "start" | "end") {
      const code = cursorCode()
      if (code) moveColumn(toEdge(code.cursorCell, code.width, edge, code.cells, unifiedShownCells))
    },
    halfColumnWindow(): number {
      const props = inputs.value
      const laid = layout()
      const width = props && laid ? codeWidth(laid, props.cursor.line) : 0
      return halfWindow(width > 0 ? width : 2)
    },
    /** The column nearest `col` that the window shows. */
    clampCursorColumn(col: number): number {
      const code = cursorCode()
      if (!code) return col
      const cell = clampCursorCell(shownColumn(), code.width, cellOfColumn(code.content, col), code.cells, unifiedShownCells)
      return columnOfCell(code.content, cell)
    },
    /** The status bar's readout, both numbers in cells, only for a line too wide for its window. */
    columnStatus(): { col: number; total: number } | null {
      const code = cursorCode()
      if (!code || code.cells === 0 || code.cells <= code.width) return null
      return { col: code.cursorCell + 1, total: code.cells }
    },
    resetColumns: () => setColumn(0),
    lineWindow: windows.lineWindow,
    lineWindows: windows.lineWindows,
    visibleRegion: windows.visibleRegion,
    visibleLines: windows.visibleLines,
    visibleFilenames: windows.visibleFilenames,
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
