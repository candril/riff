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

/** Where a thread's rows start and end in the stack. */
export interface ThreadRows {
  first: number
  last: number
}

/**
 * How many threads the bottom edge hides: every one past the window, and
 * every one in it whose header is at or under the edge row the hint covers.
 * A thread whose header is readable is one the reader has already reached,
 * however much of its tail the edge clips, so it is no thread "more".
 */
export function threadsHiddenBelow(threads: readonly ThreadRows[], edgeRow: number, after: number): number {
  return after + threads.filter((thread) => thread.first >= edgeRow).length
}

/**
 * The thread viewport's bottom edge hint. With no whole thread hidden but a
 * thread's tail running into the edge row, a bare arrow still says the text
 * goes on, without counting a thread that does not follow.
 */
export function bottomThreadHint(threads: readonly ThreadRows[], edgeRow: number, after: number): string | null {
  const hidden = threadsHiddenBelow(threads, edgeRow, after)
  if (hidden > 0) return edgeHints(0, hidden).below
  return threads.some((thread) => thread.last >= edgeRow) ? "↓" : null
}
