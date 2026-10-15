import type { VimDiffView } from "../components"
import type { SplitIsland } from "./split-island"

/** What the key handlers and features ask of the diff on screen, whichever view draws it. */
export type DiffViewport = Pick<
  VimDiffView,
  | "updateCursor"
  | "onceRebuilt"
  | "scrollCursorTo"
  | "scrollColumnsBy"
  | "halfColumnWindow"
  | "scrollColumnToEdge"
  | "clampColumnToWindow"
>

export interface SplitRoute {
  shown(): boolean
  island: Pick<SplitIsland, "scrollCursorTo">
  rowAtLine(line: number): number
  refreshCursor(): void
}

/**
 * The column methods do nothing in split: each pane gets its own column
 * window with sidescroll, and until then split never scrolls sideways.
 */
export function routeDiffViewport(unified: VimDiffView, split: SplitRoute): DiffViewport {
  return {
    updateCursor: () => split.refreshCursor(),
    // Split has no rebuild to wait for, only the caller's own synchronous reveal to run after.
    onceRebuilt: (then) => (split.shown() ? queueMicrotask(then) : unified.onceRebuilt(then)),
    scrollCursorTo: (line, where) =>
      split.shown() ? split.island.scrollCursorTo(split.rowAtLine(line), where) : unified.scrollCursorTo(line, where),
    scrollColumnsBy: (delta) => {
      if (!split.shown()) unified.scrollColumnsBy(delta)
    },
    halfColumnWindow: (line) => (split.shown() ? 1 : unified.halfColumnWindow(line)),
    scrollColumnToEdge: (line, col, edge) => {
      if (!split.shown()) unified.scrollColumnToEdge(line, col, edge)
    },
    clampColumnToWindow: (line, col) => (split.shown() ? col : unified.clampColumnToWindow(line, col)),
  }
}
