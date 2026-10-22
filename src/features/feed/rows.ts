import { unseenIn, type AppState } from "../../state"
import { visibleFeed, type FeedEvent } from "../../utils/feed"
import type { FeedRow, FeedState } from "./types"

/** What the feed is showing right now, after its filters (spec 070). */
export function visibleFeedEvents(feed: FeedState, state: AppState): FeedEvent[] {
  return visibleFeed(feed.events, {
    types: feed.types,
    filter: feed.filter,
    unseenIds: feed.unseenOnly
      ? new Set(unseenIn(state, state.comments).map((comment) => comment.id))
      : undefined,
  })
}

export function visibleFeedRows(feed: FeedState, state: AppState): FeedRow[] {
  const rows: FeedRow[] = []
  for (const event of visibleFeedEvents(feed, state)) {
    rows.push({ kind: "event", event })
    const target = event.target
    if (target?.kind !== "commit" || !feed.expandedIds.has(event.id)) continue
    const files = feed.commitFiles.get(target.sha) ?? []
    files.forEach((file, index) => {
      rows.push({ kind: "file", event, sha: target.sha, file, last: index === files.length - 1 })
    })
  }
  return rows
}
