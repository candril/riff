/**
 * Below this a pane is under 60 cells, and a gutter, a sign and a number
 * leave too little code on each side to read a line against its partner.
 */
export const SPLIT_MIN_WIDTH = 120

export interface CommentPanelColumn {
  open: boolean
  width: number
}

export const NO_COMMENT_PANEL: CommentPanelColumn = { open: false, width: 0 }

/** What is left of the screen for the diff once the file panel and the thread panel have their share. */
export function diffPaneWidth(
  screenWidth: number,
  filePanel: { visible: boolean; width: number },
  commentPanel: CommentPanelColumn
): number {
  const tree = filePanel.visible ? filePanel.width : 0
  const threads = commentPanel.open ? commentPanel.width : 0
  return Math.max(0, screenWidth - tree - threads)
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
