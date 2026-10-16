import type { CursorView } from "../vim-diff/types"
import type { SplitIsland } from "./split-island"
import type { UnifiedIsland } from "./unified-island"

/** What the key handlers and features ask of the diff on screen, whichever view draws it. */
export interface DiffViewport extends CursorView {
  /** Runs `then` once the view has drawn what the caller just changed. */
  onceRebuilt(then: () => void): void
  scrollCursorTo(line: number, where: "center" | "top" | "bottom"): void
  scrollColumnsBy(delta: number): void
  halfColumnWindow(line: number): number
  scrollColumnToEdge(line: number, col: number, edge: "start" | "end"): void
  clampColumnToWindow(line: number, col: number): number
}

type ColumnMoves = "scrollColumnsBy" | "halfColumnWindow" | "scrollColumnToEdge" | "clampCursorColumn"

export interface SplitRoute {
  shown(): boolean
  island: Pick<SplitIsland, "scrollCursorTo" | ColumnMoves>
  rowAtLine(line: number): number
  refreshCursor(): void
}

export interface UnifiedRoute {
  island: Pick<UnifiedIsland, ColumnMoves>
  scrollCursorTo(where: "center" | "top" | "bottom"): void
}

/**
 * In split the column methods act on the cursor's pane, each pane keeping
 * its own window; the cursor's line is the one the island already draws.
 * Unified has one window for every line, and every caller passes the
 * cursor's own line, which the island already draws, so it reads its own.
 */
export function routeDiffViewport(unified: UnifiedRoute, split: SplitRoute): DiffViewport {
  const shown = () => (split.shown() ? split.island : unified.island)
  return {
    updateCursor: () => split.refreshCursor(),
    // Both views draw synchronously in render(); only the caller's own reveal is left to run after.
    onceRebuilt: (then) => queueMicrotask(then),
    scrollCursorTo: (line, where) =>
      split.shown() ? split.island.scrollCursorTo(split.rowAtLine(line), where) : unified.scrollCursorTo(where),
    scrollColumnsBy: (delta) => shown().scrollColumnsBy(delta),
    halfColumnWindow: () => shown().halfColumnWindow(),
    scrollColumnToEdge: (_line, _col, edge) => shown().scrollColumnToEdge(edge),
    clampColumnToWindow: (_line, col) => shown().clampCursorColumn(col),
  }
}
