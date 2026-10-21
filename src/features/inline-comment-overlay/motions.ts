import type { Comment } from "../../types"
import { halfPage } from "../../utils/half-page"

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
 * An entry outside the mounted window has no layout to read, so its rows
 * are guessed from its text as the panel draws it: a gap and the author
 * row, the body's lines unwrapped, and above a thread's first comment its
 * divider with the space around it.
 */
function estimatedRows(comment: Comment): number {
  const lines = (comment.localEdit ?? comment.body).split("\n").filter((line) => line.trim() !== "").length
  return (comment.inReplyTo ? 2 : 5) + Math.max(1, lines)
}

/**
 * The rows each display entry takes, from its top to the next entry's top,
 * so the divider of an expanded thread counts toward the entry above it.
 */
export function entrySpans(order: readonly Comment[], layout: ThreadPanelLayout): number[] {
  return order.map((comment, i) => {
    const top = layout.tops.get(comment.id)
    if (top === undefined) return estimatedRows(comment)
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
