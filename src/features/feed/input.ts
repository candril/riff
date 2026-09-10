/**
 * Feed input handling (specs 064, 065, 070).
 *
 * The feed is a way in, not a second comments panel: `Enter` takes you where
 * the thing lives — a commit to the diff scoped to it, a comment to its
 * thread, a check to what it says — and the feed keeps its row so `a` comes
 * back to it.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import {
  clearViewFilter,
  commitViewFilter,
  moveFeedHighlight,
  showAllFeedTypes,
  startViewFilter,
  toggleFeedRowExpanded,
  toggleFeedType,
  toggleFeedUnseen,
  visibleFeedRows,
} from "../../state"
import { FEED_TYPES, type FeedEvent } from "../../utils/feed"

export interface FeedInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** A `g`/`z`/`]` chord is half-typed: its second key is not a filter. */
  chordPending: boolean
  /** Open what a row is about (spec 070). */
  onOpenEvent: (event: FeedEvent) => void
  /** Open the diff scoped to a commit, at one of its files. */
  onOpenCommitFile: (sha: string, filename: string) => void
  /** Fetch the files of a commit row that was just expanded. */
  onExpandCommit: (sha: string) => void
}

export function handleInput(key: KeyEvent, ctx: FeedInputContext): boolean {
  if (ctx.state.viewMode !== "feed") return false

  if (ctx.state.feed.filterInput) {
    if (key.name === "escape") {
      key.preventDefault()
      ctx.setState(clearViewFilter)
      ctx.render()
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      ctx.setState(commitViewFilter)
      ctx.render()
    }
    return true
  }

  // Ctrl-modified keys belong to the global handler — Ctrl-p, Ctrl-f, the
  // jumplist — so only bare keys are read here, and never the second half
  // of a chord: `gr` must refresh, not toggle reviews.
  if (key.ctrl || key.meta || ctx.chordPending) return false

  const highlighted = visibleFeedRows(ctx.state)[ctx.state.feed.highlightIndex]

  switch (key.name) {
    case "j":
    case "down":
      ctx.setState((s) => moveFeedHighlight(s, 1))
      ctx.render()
      return true

    case "k":
    case "up":
      ctx.setState((s) => moveFeedHighlight(s, -1))
      ctx.render()
      return true

    case "g":
      // `gg` and `G` are the global chords; a bare `g` starts one, so let it
      // through rather than swallowing half a sequence.
      return false

    case "u":
      ctx.setState(toggleFeedUnseen)
      ctx.render()
      return true

    case "return":
    case "enter":
      if (highlighted?.kind === "file") ctx.onOpenCommitFile(highlighted.sha, highlighted.file.filename)
      else if (highlighted) ctx.onOpenEvent(highlighted.event)
      return true

    case "escape": {
      // Esc puts everything back: every type, seen or not, no text. When
      // nothing is narrowed it is the global Esc (a toast, say).
      const f = ctx.state.feed
      if (f.types.size > 0 || f.unseenOnly || f.filter) {
        ctx.setState(showAllFeedTypes)
        ctx.render()
        return true
      }
      return false
    }
  }

  if ((key.name === "/" || key.sequence === "/") && !key.shift) {
    key.preventDefault()
    ctx.setState(startViewFilter)
    ctx.render()
    return true
  }

  const typeKey = FEED_TYPES.find((entry) => entry.key === key.name)
  if (typeKey) {
    ctx.setState((s) => toggleFeedType(s, typeKey.type))
    ctx.render()
    return true
  }

  return false
}

/**
 * `za` on a feed row. Lives outside the switch because the chord is resolved
 * by the global key handler, which owns `z`.
 */
export function toggleExpandedRow(ctx: FeedInputContext): boolean {
  const rows = visibleFeedRows(ctx.state)
  const highlighted = rows[ctx.state.feed.highlightIndex]
  if (!highlighted) return false

  // On a file, `za` folds the commit it belongs to — and the highlight goes
  // back onto that commit rather than onto whatever slides into its place.
  const event = highlighted.event
  const wasExpanded = ctx.state.feed.expandedIds.has(event.id)
  ctx.setState((s) => toggleFeedRowExpanded(s, event.id))
  if (highlighted.kind === "file") {
    const parent = rows.findIndex((row) => row.kind === "event" && row.event.id === event.id)
    if (parent !== -1) ctx.setState((s) => ({ ...s, feed: { ...s.feed, highlightIndex: parent } }))
  }
  // The files are fetched when the row is opened, not on arrival: a feed of
  // forty commits would otherwise be forty requests nobody asked for.
  if (!wasExpanded && event.target?.kind === "commit") {
    ctx.onExpandCommit(event.target.sha)
  }
  ctx.render()
  return true
}
