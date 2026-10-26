/** Where a split view's window starts, worked out the way unified scrolls. */

export interface ScrollWindow {
  scrollTop: number
  height: number
  rows: number
}

const maxScroll = ({ height, rows }: ScrollWindow) => Math.max(0, rows - height)

export function clampScroll(window: ScrollWindow): number {
  return Math.max(0, Math.min(maxScroll(window), window.scrollTop))
}

/** The scroll that keeps `row` at least `scrollOff` rows from either edge, moving as little as it can. */
export function revealRow(window: ScrollWindow, row: number, scrollOff: number): number {
  const { scrollTop, height } = window
  if (height <= 0 || row < 0) return clampScroll(window)
  if (row < scrollTop + scrollOff) return clampScroll({ ...window, scrollTop: row - scrollOff })
  if (row > scrollTop + height - scrollOff - 1) {
    return clampScroll({ ...window, scrollTop: row - height + scrollOff + 1 })
  }
  return clampScroll(window)
}

/**
 * `zz`, `zt` and `zb`. The margin is the one the reveal keeps, so the next
 * keystroke does not pull the window straight back.
 */
export function placeRow(
  window: ScrollWindow,
  row: number,
  where: "center" | "top" | "bottom",
  scrollOff: number
): number {
  const { height } = window
  if (height <= 0 || row < 0) return clampScroll(window)
  const margin = Math.min(scrollOff, Math.max(0, Math.floor(height / 2) - 1))
  const target =
    where === "center" ? row - Math.floor(height / 2) : where === "top" ? row - margin : row - height + 1 + margin
  return clampScroll({ ...window, scrollTop: target })
}

/**
 * Where a jump leaves the window. A jump lands where the eye reads next,
 * the middle of the pane, rather than at the scrolloff edge it would have
 * to be chased to; a target already in the upper half is read where it is,
 * and moving the window under it would only lose the reader's place.
 */
export function landRow(window: ScrollWindow, row: number, scrollOff: number): number {
  const { scrollTop, height } = window
  if (height <= 0 || row < 0) return clampScroll(window)
  if (row >= scrollTop && row <= scrollTop + Math.floor(height / 2)) return revealRow(window, row, scrollOff)
  return placeRow(window, row, "center", scrollOff)
}
