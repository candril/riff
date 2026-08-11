/**
 * Resolve the repo + ref a permalink should point at.
 *
 * PR mode gets everything from `PrInfo`. Local mode has to ask the VCS,
 * which `detectCurrentBranch` already knows how to ask (git branch, or the
 * nearest jj bookmark when a colocated repo leaves git's HEAD detached).
 */

import { $ } from "bun"
import type { PrInfo } from "../../providers/github"
import { detectCurrentBranch } from "../../providers/current-pr"
import { parseRemoteUrl, type RepoRef } from "./url"

/** Remote URLs don't change during a session; the ref can, so only this is cached. */
let cachedRemote: Promise<Omit<RepoRef, "ref"> | null> | null = null

/**
 * `revision` is the commit riff is displaying — the head it loaded the diff
 * at, or the single commit being viewed. Pinning there keeps the line numbers
 * honest; the branch name is only a fallback for when we don't know the SHA.
 */
export function repoRefForPr(prInfo: PrInfo, revision?: string): RepoRef {
  return {
    origin: originOf(prInfo.url),
    // Fork PRs keep the head branch on the fork, so the base repo's blob URL
    // would 404. Fall back to the base repo when gh didn't report a head repo.
    owner: prInfo.headRepoOwner ?? prInfo.owner,
    repo: prInfo.headRepoName ?? prInfo.repo,
    ref: revision ?? prInfo.headRef,
  }
}

/**
 * Whether the working copy's version of `path` differs from the one at `ref`.
 * Used to warn that a local-mode link — which can only point at something
 * already on GitHub — won't line up with the diff on screen.
 */
export async function fileDiffersAtRef(ref: string, path: string): Promise<boolean> {
  const atRef = await $`git show ${`${ref}:${path}`}`.quiet().nothrow()
  if (atRef.exitCode !== 0) return true

  const working = Bun.file(path)
  if (!(await working.exists())) return true

  return (await working.text()) !== atRef.stdout.toString()
}

/**
 * Resolve owner/repo/ref for the local checkout. Returns null when there is
 * no usable GitHub remote or no ref to point at — the caller toasts.
 */
export async function resolveLocalRepoRef(): Promise<RepoRef | null> {
  cachedRemote ??= resolveRemote()
  const remote = await cachedRemote
  if (!remote) return null

  const ref = await resolveCurrentRef()
  if (!ref) return null

  return { ...remote, ref }
}

async function resolveRemote(): Promise<Omit<RepoRef, "ref"> | null> {
  const git = await $`git remote get-url origin`.quiet().nothrow()
  if (git.exitCode === 0) {
    const parsed = parseRemoteUrl(git.stdout.toString())
    if (parsed) return parsed
  }

  const jj = await $`jj git remote list`.quiet().nothrow()
  if (jj.exitCode === 0) {
    for (const line of jj.stdout.toString().split("\n")) {
      const [name, url] = line.trim().split(/\s+/)
      if (name !== "origin" || !url) continue
      const parsed = parseRemoteUrl(url)
      if (parsed) return parsed
    }
  }

  return null
}

/**
 * Prefer a branch name over a SHA: a permalink is only worth copying if the
 * recipient can open it, and a branch keeps pointing at the work as it moves.
 * Falls back to the commit SHA when nothing is named.
 */
async function resolveCurrentRef(): Promise<string | null> {
  try {
    return await detectCurrentBranch()
  } catch {
    // No branch or bookmark — fall through to the SHA.
  }

  const sha = await $`git rev-parse HEAD`.quiet().nothrow()
  if (sha.exitCode !== 0) return null
  return sha.stdout.toString().trim() || null
}

function originOf(prUrl: string): string {
  try {
    return new URL(prUrl).origin
  } catch {
    return "https://github.com"
  }
}
