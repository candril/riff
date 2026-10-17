import type { CliRenderer } from "@opentui/core"
import { Show, batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { cellOfColumn, wholeColumns } from "../diff-rows/cells"
import { rowOfLine } from "../diff-rows/row-source"
import { lineOf, type Side } from "../diff-rows/rows"
import { SplitDiffView, type SplitDiffViewProps } from "../split-view"
import { createHeldRows } from "../split-view/held-rows"
import { contentOrigin, gutterWidth, paneWidths, visibleCells } from "../split-view/layout"
import { diffWheel } from "./diff-wheel"
import { mountSolid } from "./solid-island"
import { cursorColumnInWindow, halfWindow, revealColumn, scrollBy, toEdge } from "./split-columns"
import { lineOfRow } from "./split-cursor"
import { clampScroll, placeRow, revealRow } from "./split-scroll"
import { wheelDragRow } from "./wheel-drag"

export type SplitInputs = Omit<SplitDiffViewProps, "scrollTop" | "held" | "columns" | "width" | "height">

type LineWindow = { startCol: number; endCol: number }

const other = (side: Side): Side => (side === "left" ? "right" : "left")

const IN_HALVES = new Set(["context", "addition", "deletion", "no-newline"])

/**
 * The split view as a long-lived island. It owns its scroll and each
 * pane's column window, the way unified's island owns its one window,
 * and takes its size from the box render.ts lays it out in rather than
 * from the terminal. The pane the cursor is not in keeps its window, even
 * where that leaves a short line showing only its `‹`: crossing back finds
 * it where it was left, as unified's single window is.
 */
export function createSplitIsland(renderer: CliRenderer, scrollOff: number) {
  const [inputs, setInputs] = createStore<{ value: SplitInputs | null }>({ value: null })
  const [size, setSize] = createSignal({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = createSignal(0)
  const [columns, setColumns] = createSignal({ left: 0, right: 0 })
  let onCursorScrolledAway: ((line: number) => void) | null = null
  const held = createHeldRows(renderer)

  const island = mountSolid(
    renderer,
    () => (
      <Show when={inputs.value}>
        {(props: () => SplitInputs) => (
          <SplitDiffView
            {...props()}
            scrollTop={scrollTop()}
            held={held.span()}
            columns={columns()}
            width={size().width}
            height={size().height}
          />
        )}
      </Show>
    ),
    // A deferred resize leaves one frame drawn at the old size; clipping keeps it off the prompt row.
    { width: "100%", height: "100%", overflow: "hidden" }
  )

  const rowCount = () => inputs.value?.source.rows.length ?? 0
  const window = () => ({ scrollTop: scrollTop(), height: size().height, rows: rowCount() })
  const ensureCursorVisible = (row: number) => setScrollTop(revealRow(window(), row, scrollOff))

  const codeWidth = (props: SplitInputs, side: Side) =>
    paneWidths(size().width)[side] - contentOrigin(gutterWidth(props.mapping))

  /** The columns of a mapping line that `side`'s pane shows. */
  function windowOn(line: number, side: Side): LineWindow {
    const props = inputs.value
    const shown = props?.mapping.getLine(line)
    if (!props || !shown) return { startCol: 0, endCol: 0 }
    const width = Math.max(0, codeWidth(props, side))
    if (!IN_HALVES.has(shown.type)) return { startCol: 0, endCol: width }
    const { content } = shown
    const { first, last } = visibleCells(columns()[side], width, cellOfColumn(content, content.length))
    return wholeColumns(content, first, last)
  }

  /**
   * The line the cursor's half shows, and the room its pane has for code.
   * Null on a row with no half there (an empty half, a header, a divider):
   * nothing on it scrolls sideways.
   */
  function activeHalf() {
    const props = inputs.value
    const row = props?.source.rows[props.cursor.row]
    if (!props || row?.kind !== "pair") return null
    const index = props.side === "left" ? row.left : row.right
    const content = index === undefined ? undefined : props.mapping.getLine(index)?.content
    if (content === undefined) return null
    const width = codeWidth(props, props.side)
    const cells = cellOfColumn(content, content.length)
    return { side: props.side, content, width, cells, cursorCell: cellOfColumn(content, props.cursor.col) }
  }
  type ActiveHalf = NonNullable<ReturnType<typeof activeHalf>>

  // Only the cursor's pane moves; the other keeps its window for when the cursor crosses back.
  function moveColumn(to: (half: ActiveHalf, column: number) => number): void {
    const half = activeHalf()
    if (!half) return
    const current = columns()
    const next = to(half, current[half.side])
    if (next !== current[half.side]) setColumns({ ...current, [half.side]: next })
  }

  const scrollColumnsBy = (delta: number) => moveColumn((_half, column) => scrollBy(column, delta))

  // Only the wheel moves the window out from under the cursor: every reveal of riff's own keeps it inside.
  function dragCursorIntoView(): void {
    const props = inputs.value
    if (!props || !onCursorScrolledAway) return
    const { scrollTop: top, height, rows: total } = window()
    // One visual row per row, so the row dragged to is the row to hand over.
    const row = wheelDragRow({ scrollTop: top, height, total, cursorRow: props.cursor.row, scrollOff })
    if (row === null) return
    const line = lineOfRow(row, props.source)
    if (line !== lineOfRow(props.cursor.row, props.source)) onCursorScrolledAway(line)
  }

  // Rows bubble the wheel to the host, held ones too: the hit grid names a row a tick scrolled away until the next frame.
  island.host.onMouseScroll = diffWheel({
    rows(delta) {
      held.hold(window())
      setScrollTop(clampScroll({ ...window(), scrollTop: clampScroll(window()) + delta }))
      dragCursorIntoView()
    },
    // The cursor's pane, as zh and zl move it, wherever the pointer is.
    columns: scrollColumnsBy,
  })

  // The cursor's block takes a cell past the line's end, and the half marks that cell as part of the line.
  const revealCursorColumn = () =>
    moveColumn((half, column) =>
      revealColumn(column, half.cursorCell, half.width, Math.max(half.cells, half.cursorCell + 1))
    )

  function resize(width: number, height: number): void {
    if (width === size().width && height === size().height) return
    setSize({ width, height })
    // Until the window has a height nothing can be revealed in it.
    const row = inputs.value?.cursor.row
    if (row !== undefined) ensureCursorVisible(row)
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
     * Class instances (mapping, source, lineSpans) are handed over by
     * reference: reconcile would walk into them. The plain cursor and
     * selection are rebuilt every render and reconciled, so an
     * unchanged one notifies nothing; search and flash are the app's own
     * state objects, which only change when they are replaced.
     */
    update(next: Partial<SplitInputs>) {
      const current = inputs.value
      if (!current) {
        // Only a full set of inputs can draw; render.ts sends one before anything partial.
        if (next.mapping) setInputs("value", next as SplitInputs)
        return
      }
      const { cursor, selection, ...byReference } = next
      // Read before the merge: the store hands back the same object, already carrying the new source.
      const resourced = byReference.source !== undefined && byReference.source !== current.source
      batch(() => {
        setInputs("value", byReference)
        if (cursor) setInputs("value", "cursor", reconcile(cursor))
        if (selection !== undefined) setInputs("value", "selection", selection && reconcile(selection))
        // A fold or an expansion rebuilds the rows; the window must still fit them.
        if (resourced) ensureCursorVisible(inputs.value!.cursor.row)
      })
    },
    /** Told the line the cursor is dragged to when the wheel scrolls the window out from under it. */
    setOnCursorScrolledAway(cb: (line: number) => void) {
      onCursorScrolledAway = cb
    },
    ensureCursorVisible,
    scrollTop,
    revealColumn: revealCursorColumn,
    scrollColumnsBy,
    scrollColumnToEdge: (edge: "start" | "end") =>
      moveColumn((half) => toEdge(half.cursorCell, half.width, edge, half.cells)),
    halfColumnWindow: () => halfWindow(activeHalf()?.width ?? 2),
    /** The column nearest `col` that the cursor's pane shows. */
    clampCursorColumn(col: number): number {
      const half = activeHalf()
      if (!half) return col
      return cursorColumnInWindow(half.content, columns()[half.side], half.width, col, half.cells)
    },
    /** The status bar's readout, both numbers in cells, only for a line too wide for its pane. */
    columnStatus(): { col: number; total: number } | null {
      const half = activeHalf()
      if (!half || half.cells === 0 || half.cells <= half.width) return null
      return { col: half.cursorCell + 1, total: half.cells }
    },
    resetColumns: () => setColumns({ left: 0, right: 0 }),
    /**
     * The columns of a mapping line that the pane drawing it shows: a
     * removal's in the old pane, an addition's in the new, and a line in
     * both halves in the cursor's. A row across both panes never scrolls.
     */
    lineWindow(line: number): LineWindow {
      const props = inputs.value
      const type = props?.mapping.getLine(line)?.type
      if (!props) return { startCol: 0, endCol: 0 }
      return windowOn(line, type === "deletion" ? "left" : type === "addition" ? "right" : props.side)
    },
    /**
     * Every window a mapping line is drawn in, each tagged with its pane:
     * a line in both halves is a place to land in each. The cursor's pane
     * comes first, so on a tie it takes the nearer flash label. A row across
     * both panes has one window and no pane, as lineWindow gives it.
     */
    lineWindows(line: number): (LineWindow & { pane?: Side })[] {
      const props = inputs.value
      if (!props) return []
      const row = props.source.rows[rowOfLine(line, props.source)]
      if (row?.kind !== "pair") return [windowOn(line, props.side)]
      const sides = [props.side, other(props.side)].filter((side) => row[side] === line)
      return sides.map((side) => ({ ...windowOn(line, side), pane: side }))
    },
    /**
     * The host is only laid out once it is in the tree, a frame after split
     * is first drawn or comes back from a narrow terminal; a size given up
     * front lets that frame draw rows instead of an empty pane.
     */
    seedSize: resize,
    scrollCursorTo(row: number, where: "center" | "top" | "bottom") {
      setScrollTop(placeRow(window(), row, where, scrollOff))
    },
    viewportHeight: () => size().height,
    width: () => size().width,
    /** The mapping lines on screen, top to bottom, the active side's half before its partner. */
    visibleLines(): number[] {
      const props = inputs.value
      if (!props) return []
      const top = clampScroll(window())
      const lines: number[] = []
      for (const row of props.source.rows.slice(top, top + size().height)) {
        for (const line of new Set([lineOf(row, props.side), lineOf(row, other(props.side))])) {
          if (line !== undefined) lines.push(line)
        }
      }
      return lines
    },
    dispose() {
      disposed = true
      island.dispose()
    },
  }
}

export type SplitIsland = ReturnType<typeof createSplitIsland>
