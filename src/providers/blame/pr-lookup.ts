import { $ } from "bun"
import type { PrRef } from "./types"

type CommitPulls = (owner: string, repo: string, sha: string) => Promise<{ number: number; html_url: string }[]>

// Bun's own error names only the exit code; gh's stderr carries the HTTP status the lookup reads.
const ghCommitPulls: CommitPulls = async (owner, repo, sha) => {
  const result = await $`gh api repos/${owner}/${repo}/commits/${sha}/pulls`.quiet().nothrow()
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim() || `exit code ${result.exitCode}`)
  return result.json()
}

// GitHub's answer for a commit it has never seen, such as one not pushed yet.
const UNKNOWN_COMMIT = /HTTP (404|422)/

/**
 * Memoised per commit, since which PR introduced a commit does not change. A
 * commit GitHub does not know is kept as no PR, so an unpushed line asks
 * once; any other failure is not kept, so a network blip is asked again.
 */
export function createPrLookup(pulls: CommitPulls = ghCommitPulls) {
  const known = new Map<string, Promise<PrRef | null>>()
  return function prForCommit(owner: string, repo: string, sha: string): Promise<PrRef | null> {
    const key = `${owner}/${repo}@${sha}`
    const cached = known.get(key)
    if (cached) return cached
    const pending = pulls(owner, repo, sha).then(
      (entries) => {
        const first = entries[0]
        return first ? { number: first.number, url: first.html_url } : null
      },
      (error: unknown) => {
        if (error instanceof Error && UNKNOWN_COMMIT.test(error.message)) return null
        throw error
      },
    )
    known.set(key, pending)
    pending.catch(() => known.delete(key))
    return pending
  }
}

export const prForCommit = createPrLookup()
