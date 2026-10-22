/**
 * `za` on a feed row (specs 064, 065, 070), the one way into a row that
 * stays in the feed: it opens a commit row into the files it touched.
 */

import type { AppState } from "../../state"
import type { ActivityFeedState } from "./state"
import { visibleFeedRows } from "./rows"

export interface FeedExpandDeps {
  getState: () => AppState
  feed: ActivityFeedState
  render: () => void
  /** Fetch the files of a commit row that was just expanded. */
  onExpandCommit: (sha: string) => void
}

/**
 * `za` on a feed row. Lives outside the feed's keys because the chord is
 * resolved by the `z` chords' keymap layer, which owns `z`.
 */
export function toggleExpandedRow(deps: FeedExpandDeps): boolean {
  const rows = visibleFeedRows(deps.feed.snapshot(), deps.getState())
  const highlighted = rows[deps.feed.highlightIndex()]
  if (!highlighted) return false

  // On a file, `za` folds the commit it belongs to — and the highlight goes
  // back onto that commit rather than onto whatever slides into its place.
  const event = highlighted.event
  const wasExpanded = deps.feed.expandedIds().has(event.id)
  deps.feed.toggleExpanded(event.id)
  if (highlighted.kind === "file") {
    const parent = rows.findIndex((row) => row.kind === "event" && row.event.id === event.id)
    if (parent !== -1) deps.feed.highlight(parent)
  }
  // The files are fetched when the row is opened, not on arrival: a feed of
  // forty commits would otherwise be forty requests nobody asked for.
  if (!wasExpanded && event.target?.kind === "commit") {
    deps.onExpandCommit(event.target.sha)
  }
  deps.render()
  return true
}
