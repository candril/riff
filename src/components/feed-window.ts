import type { FeedRow, FeedState } from "../features/feed/types"
import { pickerWindow } from "./picker-window"

/**
 * The screen rows around the feed's list: the app header and the status bar,
 * the feed host's padding on top, and the feed's own header, legend and the
 * blank row under it.
 */
export const FEED_CHROME_ROWS = 6

/** A line of the feed as drawn: a FeedRow, or the "loading…" under an opened commit. */
export type FeedLine = { kind: "row"; index: number } | { kind: "loading"; index: number }

/** A commit opened before its files have arrived, which draws a loading line under it. */
function awaitsFiles(row: FeedRow, feed: FeedState): boolean {
  const target = row.event.target
  return row.kind === "event" && target?.kind === "commit" && feed.expandedIds.has(row.event.id) && !feed.commitFiles.has(target.sha)
}

export function feedLines(rows: FeedRow[], feed: FeedState): FeedLine[] {
  return rows.flatMap((row, index): FeedLine[] =>
    awaitsFiles(row, feed) ? [{ kind: "row", index }, { kind: "loading", index }] : [{ kind: "row", index }]
  )
}

/**
 * The lines that fit a terminal `height` rows tall, the highlight centred the
 * way a picker centres its selection. The loading lines take room too, or an
 * opened commit would push the last line past the status bar.
 */
export function feedWindow(rows: FeedRow[], feed: FeedState, height: number): FeedLine[] {
  const lines = feedLines(rows, feed)
  const room = Math.max(1, height - FEED_CHROME_ROWS)
  const selected = Math.max(0, lines.findIndex((line) => line.kind === "row" && line.index === feed.highlightIndex))
  const { start, end } = pickerWindow(lines.length, selected, room)
  return lines.slice(start, end)
}

/** The FeedRow indices on screen: what flash may label. */
export function feedRowsInView(rows: FeedRow[], feed: FeedState, height: number): number[] {
  return feedWindow(rows, feed, height).flatMap((line) => (line.kind === "row" ? [line.index] : []))
}
