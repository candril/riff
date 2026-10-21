import { $ } from "bun"
import type { PrRef } from "./types"

type CommitPulls = (owner: string, repo: string, sha: string) => Promise<{ number: number; html_url: string }[]>

const ghCommitPulls: CommitPulls = (owner, repo, sha) => $`gh api repos/${owner}/${repo}/commits/${sha}/pulls`.quiet().json()

/** Memoised per commit, since which PR introduced a commit does not change; a failure is not kept. */
export function createPrLookup(pulls: CommitPulls = ghCommitPulls) {
  const known = new Map<string, Promise<PrRef | null>>()
  return function prForCommit(owner: string, repo: string, sha: string): Promise<PrRef | null> {
    const key = `${owner}/${repo}@${sha}`
    const cached = known.get(key)
    if (cached) return cached
    const pending = pulls(owner, repo, sha).then((entries) => {
      const first = entries[0]
      return first ? { number: first.number, url: first.html_url } : null
    })
    known.set(key, pending)
    pending.catch(() => known.delete(key))
    return pending
  }
}

export const prForCommit = createPrLookup()
