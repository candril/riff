import type { Comment } from "../../types"
import { halfPage } from "../../utils/half-page"
import { estimatedCommentRows } from "../../components/thread-rows-estimate"

/**
 * Where the panel's entries sit as last laid out. Only the window of
 * threads around the highlight is mounted, so only those entries have a
 * top; `bottom` is where the last mounted one ends.
 */
export interface ThreadPanelLayout {
  viewportRows: number
  tops: ReadonlyMap<string, number>
  bottom: number
}

export const UNLAID: ThreadPanelLayout = { viewportRows: 0, tops: new Map(), bottom: 0 }

/**
 * The rows each display entry takes, from its top to the next entry's top,
 * so the divider of an expanded thread counts toward the entry above it.
 * Only the window of threads around the highlight is mounted; an entry
 * outside it has no layout to read, so its rows are guessed from its text
 * wrapped to `textWidth`, the columns of the panel's comment stack.
 */
export function entrySpans(order: readonly Comment[], layout: ThreadPanelLayout, textWidth: number): number[] {
  return order.map((comment, i) => {
    const top = layout.tops.get(comment.id)
    if (top === undefined) return estimatedCommentRows(comment, textWidth)
    const next = order[i + 1]
    const nextTop = next ? layout.tops.get(next.id) : undefined
    if (nextTop !== undefined) return nextTop - top
    return Math.max(1, layout.bottom - top)
  })
}

/**
 * The entry holding the row half a page below (or above) the top of entry
 * `from`. Half a page is counted in drawn rows, as the diff counts it, so a
 * long thread is a long way to move; the highlight still always moves.
 */
export function halfPageEntry(
  spans: readonly number[],
  from: number,
  direction: 1 | -1,
  viewportRows: number
): number {
  if (spans.length === 0) return from
  const last = spans.length - 1
  const step = halfPage(viewportRows)
  let index = from
  if (direction === 1) {
    let offset = 0
    while (index < last && offset + spans[index]! <= step) {
      offset += spans[index]!
      index++
    }
    return Math.min(last, Math.max(index, from + 1))
  }
  let offset = 0
  while (index > 0 && offset > -step) {
    index--
    offset -= spans[index]!
  }
  return Math.max(0, Math.min(index, from - 1))
}
