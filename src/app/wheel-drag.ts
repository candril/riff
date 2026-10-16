export interface WheelDragInput {
  scrollTop: number
  height: number
  /** Visual rows in the whole diff. */
  total: number
  cursorRow: number
  scrollOff: number
}

/**
 * The visual row the cursor is dragged to after the wheel scrolled the
 * window out from under it, null while it is still inside. vim keeps the
 * cursor in the window, and riff has a second reason to: the file tree,
 * comment anchors and `c` follow the cursor, so one left off screen makes
 * the view lie about where you are. VimDiffView's dragCursorIntoView.
 */
export function wheelDragRow({ scrollTop, height, total, cursorRow, scrollOff }: WheelDragInput): number | null {
  if (height <= 0 || total <= 0 || cursorRow < 0) return null
  // No margin against the ends of the diff: there are no rows there to keep in reserve, and the cursor
  // reveal cannot honour one either, so insisting on it would drag the cursor off the first line.
  const margin = Math.min(scrollOff, Math.max(0, Math.floor(height / 2) - 1))
  const maxScrollTop = Math.max(0, total - height)
  const first = scrollTop + (scrollTop <= 0 ? 0 : margin)
  const last = scrollTop + height - 1 - (scrollTop >= maxScrollTop ? 0 : margin)
  if (cursorRow >= first && cursorRow <= last) return null
  return cursorRow < first ? first : last
}
