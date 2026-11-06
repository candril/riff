import { readFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { loadConfig } from "../../config"

export interface RepoName {
  owner: string
  repo: string
}

export interface KnownRepo extends RepoName {
  alias?: string
}

function splitName(name: unknown): RepoName | null {
  if (typeof name !== "string") return null
  const [owner, repo, ...rest] = name.split("/")
  return owner && repo && rest.length === 0 ? { owner, repo } : null
}

export function prestoRepos(toml: string): KnownRepo[] {
  const parsed = Bun.TOML.parse(toml) as { repositories?: unknown }
  if (!Array.isArray(parsed.repositories)) return []
  const repos: KnownRepo[] = []
  for (const entry of parsed.repositories as { name?: unknown; alias?: unknown }[]) {
    const name = splitName(entry?.name)
    if (!name) continue
    repos.push(typeof entry.alias === "string" ? { ...name, alias: entry.alias } : name)
  }
  return repos
}

export function mergeKnownRepos(presto: readonly KnownRepo[], storageRepos: Record<string, string>): KnownRepo[] {
  const merged = new Map<string, KnownRepo>()
  const add = (repo: KnownRepo) => {
    const key = `${repo.owner}/${repo.repo}`.toLowerCase()
    if (!merged.has(key)) merged.set(key, repo)
  }
  presto.forEach(add)
  for (const name of Object.keys(storageRepos)) {
    const repo = splitName(name)
    if (repo) add(repo)
  }
  return [...merged.values()]
}

// A malformed or absent presto config only costs the question its options.
function readPrestoRepos(): KnownRepo[] {
  try {
    return prestoRepos(readFileSync(join(homedir(), ".config", "presto", "config.toml"), "utf-8"))
  } catch {
    return []
  }
}

export function loadKnownRepos(): KnownRepo[] {
  return mergeKnownRepos(readPrestoRepos(), loadConfig().storage.repos)
}
