import { $ } from "bun"

export interface RepoRef {
  owner: string
  repo: string
}

let cached: RepoRef | null | undefined

/**
 * Resolve the current checkout's GitHub owner/repo.
 *
 * `gh repo view` answers this with an API round-trip — half a second on the
 * startup path, for something the git remote already knows locally. We read
 * the remote instead and only fall back to `gh` when there's no remote or its
 * URL isn't in a shape we recognise.
 */
export async function getCurrentRepoRef(): Promise<RepoRef | null> {
  if (cached !== undefined) return cached
  cached = parseOwnerRepo(process.env.GH_REPO) ?? (await refFromGitRemote()) ?? (await refFromGh())
  return cached
}

/**
 * Drop the memoized ref. Only for tests — the repo can't change under a
 * running session.
 */
export function resetRepoRefCache(): void {
  cached = undefined
}

async function refFromGitRemote(): Promise<RepoRef | null> {
  const result = await $`git config --get-regexp ^remote\\.`.quiet().nothrow()
  if (result.exitCode !== 0) return null

  const urls = new Map<string, string>()
  let resolved: { remote: string; value: string } | null = null

  for (const line of result.text().split("\n")) {
    const sep = line.indexOf(" ")
    if (sep === -1) continue
    const key = line.slice(0, sep)
    const value = line.slice(sep + 1).trim()

    const urlMatch = key.match(/^remote\.(.+)\.url$/)
    if (urlMatch) {
      urls.set(urlMatch[1]!, value)
      continue
    }

    // `gh repo set-default` records the chosen base repo here; honour it so we
    // resolve the same repo `gh` would.
    const resolvedMatch = key.match(/^remote\.(.+)\.gh-resolved$/)
    if (resolvedMatch && !resolved) {
      resolved = { remote: resolvedMatch[1]!, value }
    }
  }

  if (resolved) {
    // The value is either "base" (meaning: this remote's own repo) or an
    // explicit "owner/repo" pointing somewhere that isn't a remote at all.
    const explicit = parseOwnerRepo(resolved.value)
    if (explicit) return explicit
    const url = urls.get(resolved.remote)
    if (url) return parseRemoteUrl(url)
  }

  for (const name of ["upstream", "github", "origin"]) {
    const url = urls.get(name)
    if (url) {
      const ref = parseRemoteUrl(url)
      if (ref) return ref
    }
  }

  for (const url of urls.values()) {
    const ref = parseRemoteUrl(url)
    if (ref) return ref
  }

  return null
}

async function refFromGh(): Promise<RepoRef | null> {
  try {
    const result = (await $`gh repo view --json owner,name`.quiet().json()) as {
      owner: { login: string }
      name: string
    }
    return { owner: result.owner.login, repo: result.name }
  } catch {
    return null
  }
}

/**
 * Pull owner/repo out of any of the remote URL shapes git accepts:
 * `git@host:owner/repo.git`, `ssh://git@host/owner/repo`,
 * `https://host/owner/repo.git`.
 */
function parseRemoteUrl(url: string): RepoRef | null {
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/$/, "")
  const path = trimmed.includes("://")
    ? new URL(trimmed).pathname
    : trimmed.slice(trimmed.indexOf(":") + 1)

  const segments = path.split("/").filter(Boolean)
  if (segments.length < 2) return null

  return {
    owner: segments[segments.length - 2]!,
    repo: segments[segments.length - 1]!,
  }
}

function parseOwnerRepo(value: string | undefined): RepoRef | null {
  if (!value) return null
  const match = value.trim().match(/^([^/\s]+)\/([^/\s]+)$/)
  return match ? { owner: match[1]!, repo: match[2]! } : null
}
