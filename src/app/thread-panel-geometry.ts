import type { AppState } from "../state"
import { composerRows, threadTextWidth, threadViewportRows, type ThreadRowBudget } from "../components/thread-rows-estimate"
import { columnWidthsOf } from "./column-widths"
import { diffPaneHeight } from "./diff-layout"

/**
 * The thread panel's columns and the budget its window of threads is chosen
 * by, from the screen rather than the last layout: the frame, flash and the
 * half-page motions all read it here, so they agree on which threads are
 * mounted before the panel was ever drawn. `composerText` reads what the
 * composer's textarea holds, which sizes the composer, and is called only
 * while one is open.
 */
export function threadPanelGeometry(
  state: AppState,
  chatOpen: boolean,
  screen: { width: number; height: number },
  composerText: () => string
): { width: number; budget: ThreadRowBudget } {
  const width = columnWidthsOf({ ...state, chatOpen }, screen.width).threads
  const composer = state.inlineCommentOverlay.mode !== "view" ? composerRows(composerText(), width) : null
  // The panel spans the content row, which is the diff pane's height.
  return {
    width,
    budget: { textWidth: threadTextWidth(width), viewportRows: threadViewportRows(diffPaneHeight(screen.height), composer) },
  }
}
