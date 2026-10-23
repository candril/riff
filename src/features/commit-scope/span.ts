import type { AppState } from "../../state"
import type { PrCommit } from "../../providers/github/types"

export interface CommitSpan {
  oldest: string
  newest: string
}

/**
 * Is this scope a run of commits, oldest to newest, with nothing skipped?
 * A run has one cumulative diff; a selection with gaps does not, and is
 * read as its commits' patches instead (spec 078).
 */
export function contiguousRun(commits: readonly PrCommit[], scope: readonly string[]): CommitSpan | null {
  if (scope.length < 2) return null
  const positions = scope.map((sha) => commits.findIndex((c) => c.sha === sha))
  if (positions.some((index) => index === -1)) return null
  const sorted = [...positions].sort((a, b) => a - b)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! !== sorted[i - 1]! + 1) return null
  }
  return {
    oldest: commits[sorted[sorted.length - 1]!]!.sha,
    newest: commits[sorted[0]!]!.sha,
  }
}

/**
 * The commit a span is measured from: the one before its oldest in the
 * list — which is newest-first — or the PR's base when the span starts at
 * the first commit there is.
 */
export function parentOfCommit(commits: readonly PrCommit[], baseRef: string | undefined, sha: string): string {
  const index = commits.findIndex((commit) => commit.sha === sha)
  const parent = index === -1 ? undefined : commits[index + 1]
  return parent?.sha ?? baseRef ?? `${sha}^`
}

/**
 * The oldest and newest commit in scope, or null when the whole review is
 * in view. A selection with gaps is read as its commits' own patches
 * (spec 078), and no pair of revisions spans those.
 */
export function scopeSpan(
  state: Pick<AppState, "viewingCommit" | "viewingCommitScope" | "commits">,
): CommitSpan | null {
  const newest = state.viewingCommit
  if (!newest) return null
  const scope = state.viewingCommitScope
  return scope ? contiguousRun(state.commits, scope) : { oldest: newest, newest }
}
