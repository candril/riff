/**
 * What riff knows about the pull requests and issues comments point at.
 *
 * A session-wide cache rather than app state: the answers are the same for
 * every reader of the same number, nothing about them is undoable, and the
 * two places they are used — the comments panel and the PR overview — build
 * their markdown deep inside component code that has no state to thread
 * through. The mentions roster is kept the same way, for the same reason.
 */

import type { Repo, ResolvedReference } from "../../utils/references"

const answers = new Map<string, ResolvedReference>()
let repo: Repo | null = null

export function resolvedReferences(): ReadonlyMap<string, ResolvedReference> {
  return answers
}

/** The repo a bare `#412` is read against. */
export function referenceRepo(): Repo | null {
  return repo
}

export function setReferenceRepo(next: Repo | null): void {
  repo = next
}

export function rememberReferences(entries: ReadonlyMap<string, ResolvedReference>): void {
  for (const [key, value] of entries) answers.set(key, value)
}

/** Keys already asked about, answered or not, so nothing is asked twice. */
const asked = new Set<string>()

export function unasked(keys: readonly string[]): string[] {
  return keys.filter((key) => !asked.has(key))
}

export function markAsked(keys: readonly string[]): void {
  for (const key of keys) asked.add(key)
}
