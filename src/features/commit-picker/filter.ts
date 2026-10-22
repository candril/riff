import type { AppState } from "../../state"
import type { FilteredCommit } from "../../components/CommitPicker"
import { fuzzyFilter } from "../../utils/fuzzy"

export function getFilteredCommits(state: AppState): FilteredCommit[] {
  const allCommits: FilteredCommit[] = state.commits.map((commit, index) => ({
    commit,
    index,
  }))

  return state.commitPicker.query
    ? fuzzyFilter(state.commitPicker.query, allCommits, (f) => [f.commit.message, f.commit.sha, f.commit.author])
    : allCommits
}

/** The commits marked for the next scope, newest first (spec 078). */
export function markedCommits(state: AppState): string[] {
  return state.commits.filter((commit) => state.commitPicker.marked.has(commit.sha)).map((c) => c.sha)
}
