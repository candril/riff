/** The edge rows' hints, each null while nothing lies past that edge. */
export interface OverflowHints {
  above: string | null
  below: string | null
}

const NONE: OverflowHints = { above: null, below: null }

/**
 * What a list of `total` rows scrolled to `top`, `height` rows tall, says on
 * its edges. A hint is drawn over the edge row it sits on, so its count takes
 * that row in too: N is every row you cannot read past that edge. Two rows or
 * fewer would be all hint and no list, so they get none.
 */
export function overflowHints(total: number, top: number, height: number): OverflowHints {
  if (height <= 2 || total <= height) return NONE
  const below = total - (top + height)
  return {
    above: top > 0 ? `↑ ${top + 1}` : null,
    below: below > 0 ? `↓ ${below + 1} more` : null,
  }
}

/**
 * The same hints for a list that knows what lies past each edge in whole
 * items rather than rows, so the edge row covers nothing it has to count.
 */
export function edgeHints(above: number, below: number): OverflowHints {
  return {
    above: above > 0 ? `↑ ${above}` : null,
    below: below > 0 ? `↓ ${below} more` : null,
  }
}

/**
 * How many threads the bottom edge hides: every one past the window, and
 * every one in it whose last row is at or under the edge row the hint covers.
 */
export function threadsHiddenBelow(threadLastRows: readonly number[], edgeRow: number, after: number): number {
  return after + threadLastRows.filter((row) => row >= edgeRow).length
}
