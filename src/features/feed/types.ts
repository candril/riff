import type { FeedEvent } from "../../utils/feed"

/**
 * The feed's own position: which row is highlighted, which event types are
 * shown, and the text it is narrowed by (specs 064, 070). The plain value the
 * pure readers and the drawing take; createFeedState holds it in signals.
 */
export interface FeedState {
  highlightIndex: number
  /** Empty means every type — the `[0] all` the header advertises. */
  types: ReadonlySet<string>
  filter: string
  filterInput: boolean
  /** Ids of the rows expanded into their detail (a commit's files). */
  expandedIds: ReadonlySet<string>
  /** Narrowed to what arrived since the last visit (specs 069, 070). */
  unseenOnly: boolean
  /** The stream itself, newest first. Empty until the timeline lands. */
  events: readonly FeedEvent[]
  loading: boolean
  /** Files of an expanded commit row, fetched when it is opened. */
  commitFiles: ReadonlyMap<string, CommitFileSummary[]>
}

export interface CommitFileSummary {
  filename: string
  additions: number
  deletions: number
}

/**
 * A row of the feed as drawn and navigated: an event, or one file of a
 * commit that has been opened. The highlight indexes these, so `j` walks
 * into a commit's files and `Enter` on one lands in that file (spec 070).
 */
export type FeedRow =
  | { kind: "event"; event: FeedEvent }
  | { kind: "file"; event: FeedEvent; sha: string; file: CommitFileSummary; last: boolean }

export function emptyFeed(): FeedState {
  return {
    highlightIndex: 0,
    types: new Set<string>(),
    filter: "",
    filterInput: false,
    expandedIds: new Set<string>(),
    unseenOnly: false,
    events: [],
    loading: false,
    commitFiles: new Map(),
  }
}
