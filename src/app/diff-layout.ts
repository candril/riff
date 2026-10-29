import type { AppState } from "../state"
import { columnWidthsOf } from "./column-widths"

/**
 * Below this a pane is under 60 cells, and a gutter, a sign and a number
 * leave too little code on each side to read a line against its partner.
 */
export const SPLIT_MIN_WIDTH = 120

/**
 * The pane the diff is drawn in, beside the tree, the thread panel and the
 * chat. The columns are drawn in every view, but only the diff view's pane
 * is measured.
 */
export function diffPaneWidthOf(
  state: Pick<AppState, "showFilePanel" | "filePanelExpanded" | "viewMode"> & {
    inlineCommentOverlay: Pick<AppState["inlineCommentOverlay"], "open" | "expanded">
    chatOpen: boolean
    chatExpanded: boolean
  },
  screenWidth: number
): number {
  const inDiff = state.viewMode === "diff"
  const panel = state.inlineCommentOverlay
  return columnWidthsOf(
    {
      showFilePanel: state.showFilePanel,
      filePanelExpanded: state.filePanelExpanded,
      inlineCommentOverlay: { open: panel.open && inDiff, expanded: panel.expanded },
      chatOpen: state.chatOpen && inDiff,
      chatExpanded: state.chatExpanded,
    },
    screenWidth
  ).diff
}

/**
 * Split is a request: the diff is drawn side by side only where both panes
 * fit. With no lines to draw unified takes over, since it is the view that
 * says why the diff is empty.
 */
export function splitShown(requested: boolean, paneWidth: number, lineCount: number): boolean {
  return requested && paneWidth >= SPLIT_MIN_WIDTH && lineCount > 0
}

/**
 * The screen less the header's row and the status bar's, which is what the
 * diff fills. A search prompt takes one more, which the pane's own layout
 * settles a tick later.
 */
export function diffPaneHeight(screenHeight: number): number {
  return Math.max(0, screenHeight - 2)
}
