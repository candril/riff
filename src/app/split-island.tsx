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
    { width: "100%", height: "100%" }
  )

  const rowCount = () => inputs.value?.source.rows.length ?? 0
  const window = () => ({ scrollTop: scrollTop(), height: size().height, rows: rowCount() })
  const ensureCursorVisible = (row: number) => setScrollTop(revealRow(window(), row, scrollOff))

  island.host.onSizeChange = () => {
    const { width, height } = island.host
    if (width === size().width && height === size().height) return
    setSize({ width, height })
    // Until the first layout the window has no height, so nothing could be revealed before now.
    const row = inputs.value?.cursor.row
    if (row !== undefined) ensureCursorVisible(row)
  }

  return {
    host: island.host,
    /**
     * Class instances (mapping, source, lineSpans) are handed over by
     * reference: reconcile would walk into them. Only the plain cursor and
     * column window are reconciled, so an unchanged one notifies nothing.
     */
    update(next: Partial<SplitInputs>) {
      const current = inputs.value
      if (!current) {
        // Only a full set of inputs can draw; render.ts sends one before anything partial.
        if (next.mapping) setInputs("value", next as SplitInputs)
        return
      }
      const { cursor, columns, ...byReference } = next
      batch(() => {
        setInputs("value", byReference)
        if (cursor) setInputs("value", "cursor", reconcile(cursor))
        if (columns) setInputs("value", "columns", reconcile(columns))
        // A fold or an expansion rebuilds the rows; the window must still fit them.
        if (byReference.source && byReference.source !== current.source) {
          ensureCursorVisible(inputs.value!.cursor.row)
        }
      })
    },
    ensureCursorVisible,
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
    dispose: island.dispose,
  }
}

export type SplitIsland = ReturnType<typeof createSplitIsland>
