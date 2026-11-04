import type { PrCommit } from "../../providers/github/types"
import type { FilteredCommit } from "../../components/CommitPicker"
import { fuzzyFilterMatches } from "../../utils/fuzzy"

const COMMIT_FIELDS = ["message", "sha", "author"] as const

export function getFilteredCommits(commits: readonly PrCommit[], query: string): FilteredCommit[] {
  const allCommits: FilteredCommit[] = commits.map((commit, index) => ({
    commit,
    index,
  }))

  if (!query) return allCommits
  return fuzzyFilterMatches(query, allCommits, (f) => [f.commit.message, f.commit.sha, f.commit.author]).map(
    ({ item, field, positions }) => ({ ...item, matched: { field: COMMIT_FIELDS[field]!, positions } })
  )
}

/** The commits marked for the next scope, newest first (spec 078). */
export function markedCommits(commits: readonly PrCommit[], marked: ReadonlySet<string>): string[] {
  return commits.filter((commit) => marked.has(commit.sha)).map((c) => c.sha)
}
