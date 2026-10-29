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
 * while one is open. `pickerRoom` is what the composer, at the panel's foot,
 * leaves below the one-row header for a picker floating above it.
 */
export function threadPanelGeometry(
  state: AppState,
  chat: { open: boolean; expanded: boolean },
  screen: { width: number; height: number },
  composerText: () => string
): { width: number; budget: ThreadRowBudget; pickerRoom: number | null } {
  const width = columnWidthsOf({ ...state, chatOpen: chat.open, chatExpanded: chat.expanded }, screen.width).threads
  const composer = state.inlineCommentOverlay.mode !== "view" ? composerRows(composerText(), width) : null
  // The panel spans the content row, which is the diff pane's height.
  const panelRows = diffPaneHeight(screen.height)
  const pickerRoom = composer === null ? 0 : panelRows - 1 - composer
  return {
    width,
    budget: { textWidth: threadTextWidth(width), viewportRows: threadViewportRows(panelRows, composer) },
    pickerRoom: pickerRoom > 0 ? pickerRoom : null,
  }
}
