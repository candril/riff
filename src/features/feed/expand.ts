/**
 * Opening a feed row into its detail (specs 064, 065, 070).
 *
 * The feed is a way in, not a second comments panel: `Enter` takes you where
 * the thing lives — a commit to the diff scoped to it, a comment to its
 * thread, a check to what it says — and the feed keeps its row so `a` comes
 * back to it. `za` is the exception that stays in the feed: it opens a
 * commit row into the files it touched.
 */

import type { AppState } from "../../state"
import { toggleFeedRowExpanded, visibleFeedRows } from "../../state"

export interface FeedExpandDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** Fetch the files of a commit row that was just expanded. */
  onExpandCommit: (sha: string) => void
}

/**
 * `za` on a feed row. Lives outside the feed's keys because the chord is
 * resolved by the `z` chords' keymap layer, which owns `z`.
 */
export function toggleExpandedRow(deps: FeedExpandDeps): boolean {
  const state = deps.getState()
  const rows = visibleFeedRows(state)
  const highlighted = rows[state.feed.highlightIndex]
  if (!highlighted) return false

  // On a file, `za` folds the commit it belongs to — and the highlight goes
  // back onto that commit rather than onto whatever slides into its place.
  const event = highlighted.event
  const wasExpanded = state.feed.expandedIds.has(event.id)
  deps.setState((s) => toggleFeedRowExpanded(s, event.id))
  if (highlighted.kind === "file") {
    const parent = rows.findIndex((row) => row.kind === "event" && row.event.id === event.id)
    if (parent !== -1) deps.setState((s) => ({ ...s, feed: { ...s.feed, highlightIndex: parent } }))
  }
  // The files are fetched when the row is opened, not on arrival: a feed of
  // forty commits would otherwise be forty requests nobody asked for.
  if (!wasExpanded && event.target?.kind === "commit") {
    deps.onExpandCommit(event.target.sha)
  }
  deps.render()
  return true
}
