import { registerFeedKeys, type FeedKeyDeps } from "../features/feed/keys"
import { pendingMarkChordGivesWay } from "../features/marks"
import { createFeedState, createInitialState, type AppState, type CommitFileSummary } from "../state"
import type { FeedEvent } from "../utils/feed"
import { keymapHarness } from "./keymap-keys"

export const FEED_EVENTS: FeedEvent[] = [
  { id: "c1", type: "comment", at: "2026-03-01T11:55:00Z", actor: "alice", lead: "src/a.ts:3", title: "Rename this", target: { kind: "comment", commentId: "c1" } },
  { id: "r1", type: "review", at: "2026-03-01T09:00:00Z", actor: "carol", title: "approved", note: "LGTM" },
  { id: "commit-abc", type: "commit", at: "2026-02-28T10:00:00Z", actor: "dave", lead: "abc", title: "fix: hunks", target: { kind: "commit", sha: "abc" } },
  { id: "k1", type: "check", at: "2026-02-28T09:00:00Z", title: "build", trailing: "✗ failed", target: { kind: "check", url: null } },
]

export const COMMIT_FILES: CommitFileSummary[] = [
  { filename: "src/diff.ts", additions: 12, deletions: 3 },
  { filename: "src/diff.test.ts", additions: 40, deletions: 0 },
]

/**
 * riff on the feed with a few events, the commit opened into its two files:
 * rows are c1, r1, the commit, its two files and the check.
 */
export function feedState(patch: Partial<AppState["feed"]> = {}): AppState {
  return {
    ...createInitialState([], [], "test", ""),
    appMode: "pr",
    viewMode: "feed",
    feed: {
      ...createFeedState(),
      events: FEED_EVENTS,
      expandedIds: new Set(["commit-abc"]),
      commitFiles: new Map([["abc", COMMIT_FILES]]),
      ...patch,
    },
  }
}

/**
 * The feed's layers on a real keymap in front of a recording chain, every
 * hand-off to the app in `calls`. The pending chord is `chord`, which
 * the dispatch entry settles the way the mark layer does outside the diff,
 * where every key gives way. Call it inside a test.
 */
export async function feedKeys(initial: AppState) {
  let state = initial
  let chord: string | null = null
  const harness = await keymapHarness({
    settle: (key) => {
      if (pendingMarkChordGivesWay(chord, key, false)) chord = null
    },
  })
  const calls: string[] = []
  const deps: FeedKeyDeps = {
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render() {},
    onOpenEvent: (event) => void calls.push(`openEvent ${event.id}`),
    onOpenCommitFile: (sha, filename) => void calls.push(`openCommitFile ${sha} ${filename}`),
    chainChordPending: () => chord !== null,
  }
  const unregister = registerFeedKeys(harness.riffKeymap, deps)
  return {
    ...harness,
    calls,
    unregister,
    state: () => state,
    set: (next: AppState) => {
      state = next
    },
    chord: () => chord,
    setChord: (next: string | null) => {
      chord = next
    },
  }
}
