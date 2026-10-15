/**
 * Below this a pane is under 60 cells, and a gutter, a sign and a number
 * leave too little code on each side to read a line against its partner.
 */
export const SPLIT_MIN_WIDTH = 120

/** What is left of the screen for the diff once the file panel has its share. */
export function diffPaneWidth(screenWidth: number, filePanel: { visible: boolean; width: number }): number {
  return Math.max(0, screenWidth - (filePanel.visible ? filePanel.width : 0))
}

/**
 * Split is a request: the diff is drawn side by side only where both panes
 * fit. With no lines to draw unified takes over, since it is the view that
 * says why the diff is empty.
 */
export function splitShown(requested: boolean, paneWidth: number, lineCount: number): boolean {
  return requested && paneWidth >= SPLIT_MIN_WIDTH && lineCount > 0
}
