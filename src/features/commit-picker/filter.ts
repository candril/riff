import type { PrCommit } from "../../providers/github/types"
import type { FilteredCommit } from "../../components/CommitPicker"
import { fuzzyFilter } from "../../utils/fuzzy"

export function getFilteredCommits(commits: readonly PrCommit[], query: string): FilteredCommit[] {
  const allCommits: FilteredCommit[] = commits.map((commit, index) => ({
    commit,
    index,
  }))

  return query
    ? fuzzyFilter(query, allCommits, (f) => [f.commit.message, f.commit.sha, f.commit.author])
    : allCommits
}

/** The commits marked for the next scope, newest first (spec 078). */
export function markedCommits(commits: readonly PrCommit[], marked: ReadonlySet<string>): string[] {
  return commits.filter((commit) => marked.has(commit.sha)).map((c) => c.sha)
}
