import type { CliRenderer } from "@opentui/core"
import { Show, batch, createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { lineOf, type Side } from "../diff-rows/rows"
import { SplitDiffView, type SplitDiffViewProps } from "../split-view"
import { mountSolid } from "./solid-island"
import { clampScroll, placeRow, revealRow } from "./split-scroll"

export type SplitInputs = Omit<SplitDiffViewProps, "scrollTop" | "width" | "height">

const other = (side: Side): Side => (side === "left" ? "right" : "left")

/**
 * The split view as a long-lived island. It owns its scroll, the way
 * VimDiffView's scrollbox owns unified's, and takes its size from the box
 * render.ts lays it out in rather than from the terminal.
 */
export function createSplitIsland(renderer: CliRenderer, scrollOff: number) {
  const [inputs, setInputs] = createStore<{ value: SplitInputs | null }>({ value: null })
  const [size, setSize] = createSignal({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = createSignal(0)

  const island = mountSolid(
    renderer,
    () => (
      <Show when={inputs.value}>
        {(props: () => SplitInputs) => (
          <SplitDiffView
            {...props()}
            scrollTop={scrollTop()}
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

  function resize(width: number, height: number): void {
    if (width === size().width && height === size().height) return
    setSize({ width, height })
    // Until the window has a height nothing can be revealed in it.
    const row = inputs.value?.cursor.row
    if (row !== undefined) ensureCursorVisible(row)
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
     * reference: reconcile would walk into them. The plain cursor, column
     * window and selection are rebuilt every render and reconciled, so an
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
      const { cursor, columns, selection, ...byReference } = next
      batch(() => {
        setInputs("value", byReference)
        if (cursor) setInputs("value", "cursor", reconcile(cursor))
        if (columns) setInputs("value", "columns", reconcile(columns))
        if (selection !== undefined) setInputs("value", "selection", selection && reconcile(selection))
        // A fold or an expansion rebuilds the rows; the window must still fit them.
        if (byReference.source && byReference.source !== current.source) {
          ensureCursorVisible(inputs.value!.cursor.row)
        }
      })
    },
    ensureCursorVisible,
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
