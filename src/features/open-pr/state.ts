/**
 * The screen `riff` shows with nothing to review (spec 112): the field, the
 * lookup behind it, and the question of which repository an id belongs to.
 */

import { createMemo, createSignal } from "solid-js"
import type { PrLookups, PrSummary } from "../../providers/github/lookups"
import type { KnownRepo, RepoName } from "./known-repos"
import { parsePrReference, resolvePrReference } from "./reference"

export const repoKey = (repo: RepoName) => `${repo.owner}/${repo.repo}`

export interface OpenPrChoice extends RepoName {
  number: number
}

export interface PickRow {
  repo: KnownRepo
  /** Absent while the lookup runs, and for good when it failed. */
  pr?: PrSummary
}

interface Pick {
  number: number
  rows: readonly PickRow[]
  looking: boolean
}

export interface OpenPrDeps {
  current: RepoName | null
  known: readonly KnownRepo[]
  lookup: (repos: readonly RepoName[], number: number) => Promise<PrLookups>
  onChoose: (choice: OpenPrChoice) => void
}

export type OpenPrState = ReturnType<typeof createOpenPrState>

export function createOpenPrState(deps: OpenPrDeps) {
  const [error, setError] = createSignal<string | null>(null)
  const [checking, setChecking] = createSignal<string | null>(null)
  const [pick, setPick] = createSignal<Pick | null>(null)
  const [selected, setSelected] = createSignal<string | null>(null)

  // Bumped by every submit and by leaving, so a lookup nobody waits for any more lands nowhere.
  let request = 0

  const rows = () => pick()?.rows ?? []
  // By repository rather than by position, so rows leaving as the lookup lands don't move the reader off theirs.
  const highlight = createMemo(() => {
    const at = rows().findIndex((row) => repoKey(row.repo) === selected())
    return Math.max(at, 0)
  })

  async function open(choice: OpenPrChoice): Promise<void> {
    const mine = ++request
    setError(null)
    setChecking(`Looking up ${repoKey(choice)}#${choice.number}…`)
    const found = await deps.lookup([choice], choice.number).then(
      (lookups) => ({ pr: lookups.get(repoKey(choice)) ?? null }),
      (failure: unknown) => ({ failure: failure instanceof Error ? failure.message : String(failure) })
    )
    if (mine !== request) return
    setChecking(null)
    if ("failure" in found) setError(found.failure)
    else if (!found.pr) setError(`There is no ${repoKey(choice)}#${choice.number}`)
    else deps.onChoose(choice)
  }

  async function ask(number: number, repos: readonly KnownRepo[]): Promise<void> {
    const mine = ++request
    setError(null)
    setSelected(null)
    setPick({ number, rows: repos.map((repo) => ({ repo })), looking: true })
    const lookups = await deps.lookup(repos, number).catch(() => null)
    if (mine !== request) return
    if (!lookups) {
      setPick({ number, rows: repos.map((repo) => ({ repo })), looking: false })
      return
    }
    const found = repos.flatMap((repo) => {
      const pr = lookups.get(repoKey(repo))
      return pr ? [{ repo, pr }] : []
    })
    if (found.length === 0) {
      setPick(null)
      setError(`None of the known repos has a #${number}, so paste owner/repo#${number}`)
      return
    }
    setPick({ number, rows: found, looking: false })
  }

  return {
    error,
    checking,
    pick,
    highlight,
    /** What the field holds changed, so an error about what it held no longer applies. */
    edited(): void {
      setError(null)
    },
    submit(text: string): void {
      if (!text.trim()) return
      const reference = parsePrReference(text)
      if (!reference) {
        setError(`Can't read "${text.trim()}" as a PR`)
        return
      }
      const resolved = resolvePrReference(reference, deps)
      if (resolved.kind === "unknown") setError(resolved.message)
      else if (resolved.kind === "ask") void ask(resolved.number, resolved.repos)
      else void open({ owner: resolved.owner, repo: resolved.repo, number: resolved.number })
    },
    move(delta: number): void {
      const count = rows().length
      if (count === 0) return
      const next = rows()[(highlight() + delta + count) % count]!
      setSelected(repoKey(next.repo))
    },
    /** The PR under the highlight. Not looked up again: the list already did, or could not. */
    choose(): void {
      const shown = pick()
      const row = rows()[highlight()]
      if (!shown || !row) return
      request++
      deps.onChoose({ owner: row.repo.owner, repo: row.repo.repo, number: shown.number })
    },
    /** Back out of whatever runs, the list or a lookup. False when there was nothing to back out of. */
    back(): boolean {
      if (!pick() && !checking()) return false
      request++
      setPick(null)
      setChecking(null)
      return true
    },
  }
}
