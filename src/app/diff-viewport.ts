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
  island: Pick<
    SplitIsland,
    "scrollCursorTo" | "scrollColumnsBy" | "halfColumnWindow" | "scrollColumnToEdge" | "clampCursorColumn"
  >
  rowAtLine(line: number): number
  refreshCursor(): void
}

/**
 * In split the column methods act on the cursor's pane, each pane keeping
 * its own window; the cursor's line is the one the island already draws.
 */
export function routeDiffViewport(unified: VimDiffView, split: SplitRoute): DiffViewport {
  return {
    updateCursor: () => split.refreshCursor(),
    // Split has no rebuild to wait for, only the caller's own synchronous reveal to run after.
    onceRebuilt: (then) => (split.shown() ? queueMicrotask(then) : unified.onceRebuilt(then)),
    scrollCursorTo: (line, where) =>
      split.shown() ? split.island.scrollCursorTo(split.rowAtLine(line), where) : unified.scrollCursorTo(line, where),
    scrollColumnsBy: (delta) =>
      split.shown() ? split.island.scrollColumnsBy(delta) : unified.scrollColumnsBy(delta),
    halfColumnWindow: (line) => (split.shown() ? split.island.halfColumnWindow() : unified.halfColumnWindow(line)),
    scrollColumnToEdge: (line, col, edge) =>
      split.shown() ? split.island.scrollColumnToEdge(edge) : unified.scrollColumnToEdge(line, col, edge),
    clampColumnToWindow: (line, col) =>
      split.shown() ? split.island.clampCursorColumn(col) : unified.clampColumnToWindow(line, col),
  }
}
