import { shortShaOf, type BlameLine, type PrRef } from "./types"

export const BLAME_QUERY = `query($owner: String!, $name: String!, $expression: String!, $path: String!) {
  repository(owner: $owner, name: $name) {
    object(expression: $expression) {
      ... on Commit {
        blame(path: $path) {
          ranges {
            startingLine
            endingLine
            commit {
              oid
              abbreviatedOid
              committedDate
              messageHeadline
              author { name date user { login } }
              associatedPullRequests(first: 1) { nodes { number url } }
            }
          }
        }
      }
    }
  }
}`

interface BlameRange {
  startingLine: number
  endingLine: number
  commit: {
    oid: string
    committedDate: string
    messageHeadline: string
    author: { name: string | null; date: string | null; user: { login: string } | null } | null
    associatedPullRequests: { nodes: PrRef[] } | null
  }
}

interface BlameResponse {
  data?: { repository?: { object?: { blame?: { ranges: BlameRange[] } | null } | null } | null }
}

/** Null when the revision, or the file at it, is not on GitHub. */
export function parseGithubBlame(json: unknown): { blame: BlameLine[]; prs: Map<string, PrRef> } | null {
  const ranges = (json as BlameResponse)?.data?.repository?.object?.blame?.ranges
  if (!ranges) return null
  const blame: BlameLine[] = []
  const prs = new Map<string, PrRef>()
  for (const { startingLine, endingLine, commit } of ranges) {
    const pr = commit.associatedPullRequests?.nodes[0]
    if (pr) prs.set(commit.oid, { number: pr.number, url: pr.url })
    const line: BlameLine = {
      kind: "commit",
      commit: {
        sha: commit.oid,
        shortSha: shortShaOf(commit.oid),
        author: commit.author?.name || commit.author?.user?.login || "unknown",
        date: commit.author?.date ?? commit.committedDate,
        subject: commit.messageHeadline,
      },
    }
    for (let number = startingLine; number <= endingLine; number++) blame[number] = line
  }
  return { blame, prs }
}
