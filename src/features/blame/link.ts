import type { LineBlame } from "../../providers/blame/source"
import type { RepoRef } from "../../providers/repo"

/** The PR says why a line changed better than the commit alone, so it wins when there is one. */
export function blameLinkOf(result: LineBlame, repo: RepoRef | null): string | null {
  if (result.line.kind !== "commit") return null
  if (result.pr) return result.pr.url
  return repo ? `https://github.com/${repo.owner}/${repo.repo}/commit/${result.line.commit.sha}` : null
}
