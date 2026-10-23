import { createInitialState, type AppState } from "../state"
import type { PrCommit } from "../providers/github/types"
import type { CommitScopeLoadContext } from "../features/commit-scope/load"
import { prInfo } from "./pr-info"

/** Four commits, newest first, as the review lists them. */
export const SCOPE_COMMITS: PrCommit[] = ["ddd4444", "ccc3333", "bbb2222", "aaa1111"].map((sha) => ({
  sha,
  message: `commit ${sha}`,
  author: "a",
  date: "2026-01-01T00:00:00Z",
}))

/** A one-hunk patch to `filename` that adds `line`. */
export function patch(filename: string, line: string, start = 1): string {
  return [
    `diff --git a/${filename} b/${filename}`,
    `--- a/${filename}`,
    `+++ b/${filename}`,
    `@@ -${start},1 +${start},2 @@`,
    " context",
    `+${line}`,
  ].join("\n")
}

/** A review of SCOPE_COMMITS, from a PR or from the local checkout. */
export function commitsReview(mode: "pr" | "local"): AppState {
  const state = createInitialState([], [], mode === "pr" ? "gh:owner/repo#1259" : "local", "a review", null, null, [], mode, mode === "pr" ? prInfo("") : null)
  return { ...state, commits: SCOPE_COMMITS }
}

/** Fetchers that fail the test if asked: each test stubs the ones it expects. */
export function loadContext(state: AppState, stubs: Partial<CommitScopeLoadContext> = {}): CommitScopeLoadContext {
  const unexpected = (name: string) => () => Promise.reject(new Error(`unexpected ${name}`))
  return {
    getState: () => state,
    target: undefined,
    fetchCommitDiff: unexpected("fetchCommitDiff"),
    fetchCommitRangeDiff: unexpected("fetchCommitRangeDiff"),
    getLocalCommitDiff: unexpected("getLocalCommitDiff"),
    getLocalCommitRangeDiff: unexpected("getLocalCommitRangeDiff"),
    getCommitParentSha: unexpected("getCommitParentSha"),
    ...stubs,
  }
}
