import type { AppState } from "../state"
import { commentPanelWidth } from "../features/inline-comment-overlay/width"
import { chatColumnWidth } from "../features/chat/width"

/**
 * Below this a pane is under 60 cells, and a gutter, a sign and a number
 * leave too little code on each side to read a line against its partner.
 */
export const SPLIT_MIN_WIDTH = 120

export interface SideColumn {
  open: boolean
  width: number
}

const CLOSED: SideColumn = { open: false, width: 0 }

/** What is left of the screen for the diff once the file panel, the thread panel and the chat have their share. */
export function diffPaneWidth(
  screenWidth: number,
  filePanel: { visible: boolean; width: number },
  commentPanel: SideColumn,
  chatColumn: SideColumn = CLOSED
): number {
  const tree = filePanel.visible ? filePanel.width : 0
  const threads = commentPanel.open ? commentPanel.width : 0
  const chat = chatColumn.open ? chatColumn.width : 0
  return Math.max(0, screenWidth - tree - threads - chat)
}

/**
 * The pane the diff is drawn in, beside the tree, the thread panel and the
 * chat. The columns are drawn in every view, but only the diff view's pane
 * is measured.
 */
export function diffPaneWidthOf(
  state: Pick<AppState, "showFilePanel" | "viewMode" | "chatOpen"> & {
    inlineCommentOverlay: Pick<AppState["inlineCommentOverlay"], "open" | "expanded">
  },
  screenWidth: number,
  treeWidth: number
): number {
  const panel = state.inlineCommentOverlay
  return diffPaneWidth(
    screenWidth,
    { visible: state.showFilePanel, width: treeWidth },
    { open: panel.open && state.viewMode === "diff", width: commentPanelWidth(screenWidth, panel.expanded) },
    { open: state.chatOpen && state.viewMode === "diff", width: chatColumnWidth(screenWidth) }
  )
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
