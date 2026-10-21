import { $ } from "bun"
import { join, dirname, resolve } from "path"
import { homedir } from "os"
import { existsSync } from "fs"
import { loadConfig } from "../config"
import { getCurrentRepoRef } from "../providers/repo"

const LOCAL_STORAGE_DIR = ".riff"
const GLOBAL_STORAGE_DIR = join(homedir(), ".riff")

/** Where every local review's comments live, whatever revset opened it. */
export const LOCAL_DIR = "local"

/**
 * Filled once riff has asked about an auto-detected path, so every later
 * read of the same source lands where the reader agreed it should.
 */
const resolvedStorageDirs = new Map<string, string>()

/**
 * `<repo root>/.riff`, so a review is the same one whether riff (or `riff
 * comments`) runs from the root or three directories down. Falls back to the
 * working directory outside a repo, where there is no root to anchor to.
 */
export function localStorageDir(startPath: string = process.cwd()): string {
  let current = resolve(startPath)
  while (current !== dirname(current)) {
    if (isRepoDir(current)) return join(current, LOCAL_STORAGE_DIR)
    current = dirname(current)
  }
  return join(resolve(startPath), LOCAL_STORAGE_DIR)
}

function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2))
  }
  return p
}

export async function findRepoRoot(startPath: string = process.cwd()): Promise<string | null> {
  let current = resolve(startPath)

  while (current !== dirname(current)) {
    if (isRepoDir(current)) return current
    current = dirname(current)
  }

  return isRepoDir(current) ? current : null
}

/**
 * A repository lives here? `.git` is a directory in a normal clone and a file
 * in a worktree or submodule, and `.jj` is always a directory — `existsSync`
 * covers all three, which `Bun.file().exists()` does not: it is false for any
 * directory, so this check failed on every ordinary repo.
 */
function isRepoDir(path: string): boolean {
  return existsSync(join(path, ".git")) || existsSync(join(path, ".jj"))
}

async function isValidRepo(path: string): Promise<boolean> {
  try {
    return isRepoDir(path)
  } catch {
    return false
  }
}

async function getGitRemoteUrl(path: string): Promise<string | null> {
  try {
    const result = await Bun.$`git -C ${path} remote get-url origin`.quiet().text()
    return result.trim()
  } catch {
    return null
  }
}

/** The checkout's GitHub owner/repo, or null when it is not a repo or has no GitHub remote. */
export async function getCurrentRepoInfo(): Promise<{ owner: string; repo: string } | null> {
  return getCurrentRepoRef()
}

async function isCurrentRepo(source: string): Promise<boolean> {
  // Local sources always belong to current repo
  if (!source.startsWith("gh:")) {
    return true
  }

  const match = source.match(/^gh:([^/]+)\/([^#]+)#/)
  if (!match) {
    return true // Can't parse, assume local
  }

  const [, sourceOwner, sourceRepo] = match
  const currentRepo = await getCurrentRepoInfo()

  if (!currentRepo) {
    return false // Not in a git repo, use global storage
  }

  return (
    currentRepo.owner.toLowerCase() === sourceOwner!.toLowerCase() &&
    currentRepo.repo.toLowerCase() === sourceRepo!.toLowerCase()
  )
}

/** The checkout `storage.repos` maps "owner/repo" to, when it is a repo. */
async function findLocalRepoFromConfig(owner: string, repo: string): Promise<string | null> {
  const config = loadConfig()

  const key = `${owner}/${repo}`
  const mappedPath = config.storage.repos[key]

  if (mappedPath) {
    const expanded = expandPath(mappedPath)
    if (await isValidRepo(expanded)) {
      return expanded
    }
  }

  return null
}

async function autoDetectRepoInBasePath(repo: string, basePath: string): Promise<string | null> {
  const expanded = expandPath(basePath)
  const candidatePath = join(expanded, repo)

  if (await isValidRepo(candidatePath)) {
    // A folder that happens to share the name is not the repo; its remote must say so.
    const remote = await getGitRemoteUrl(candidatePath)
    if (remote?.includes(repo)) {
      return candidatePath
    }
  }

  return null
}

interface RepoResolution {
  path: string
  source: "config" | "workspace" | "configMapping" | "basePath" | "cwd" | "repoRoot" | "global"
  /** A guessed checkout is the reader's to accept before riff writes into it. */
  needsConfirmation: boolean
  /** The checkout itself, without `.riff`, to name it when asking. */
  repoPath?: string
}

function parseSource(source: string): { owner: string; repo: string } | null {
  const match = source.match(/^gh:([^/]+)\/([^#]+)#/)
  if (match) {
    return { owner: match[1]!, repo: match[2]! }
  }
  return null
}

/**
 * The `.riff/` of the jj workspace a `name@` source names, or null when the
 * source is anything else or jj knows no such workspace.
 */
async function workspaceStorageDir(source: string): Promise<string | null> {
  const workspace = source.match(/^([\w.-]+)@$/)?.[1]
  if (!workspace) return null
  const result = await $`jj workspace root --name ${workspace}`.quiet().nothrow()
  if (result.exitCode !== 0) return null
  return join(result.text().trim(), LOCAL_STORAGE_DIR)
}

/**
 * Resolution order:
 * 1. Config storage.path override
 * 2. Config storage.repos explicit mapping (for GitHub PRs)
 * 3. Current directory if it matches the PR's repo
 * 4. Config storage.basePath auto-detection (needs confirmation)
 * 5. Repo root (find .git/.jj)
 * 6. Global ~/.riff/ as fallback
 */
async function resolveStorageDir(source: string): Promise<RepoResolution> {
  const config = loadConfig()

  // 1. Explicit config path override
  if (config.storage.path) {
    return {
      path: expandPath(config.storage.path),
      source: "config",
      needsConfirmation: false,
    }
  }

  // Another jj workspace's notes live in that workspace. `riff name@` is a
  // view of its working copy, and `riff comments` run there — by the agent
  // whose work it is — reads the same store.
  const workspaceDir = await workspaceStorageDir(source)
  if (workspaceDir) {
    return {
      path: workspaceDir,
      source: "workspace",
      needsConfirmation: false,
      repoPath: dirname(workspaceDir),
    }
  }

  const parsed = parseSource(source)
  if (parsed) {
    const { owner, repo } = parsed

    // 2. Explicit mapping in config
    const mappedRepo = await findLocalRepoFromConfig(owner, repo)
    if (mappedRepo) {
      return {
        path: join(mappedRepo, LOCAL_STORAGE_DIR),
        source: "configMapping",
        needsConfirmation: false,
        repoPath: mappedRepo,
      }
    }

    // 3. Check if cwd matches
    const isLocal = await isCurrentRepo(source)
    if (isLocal) {
      return {
        path: localStorageDir(),
        source: "cwd",
        needsConfirmation: false,
      }
    }

    // 4. Try basePath auto-detection (needs confirmation)
    if (config.storage.basePath) {
      const autoDetected = await autoDetectRepoInBasePath(repo, config.storage.basePath)
      if (autoDetected) {
        return {
          path: join(autoDetected, LOCAL_STORAGE_DIR),
          source: "basePath",
          needsConfirmation: true,
          repoPath: autoDetected,
        }
      }
    }
  }

  // 5. Check if cwd matches (for non-PR sources like "local")
  const isLocal = await isCurrentRepo(source)
  if (isLocal) {
    return {
      path: localStorageDir(),
      source: "cwd",
      needsConfirmation: false,
    }
  }

  // 6. Try to find repo root
  const repoRoot = await findRepoRoot()
  if (repoRoot) {
    return {
      path: join(repoRoot, LOCAL_STORAGE_DIR),
      source: "repoRoot",
      needsConfirmation: false,
      repoPath: repoRoot,
    }
  }

  // 7. Global fallback
  return {
    path: GLOBAL_STORAGE_DIR,
    source: "global",
    needsConfirmation: false,
  }
}

/**
 * Resolve a source's storage once at startup, asking the reader before riff
 * writes into a checkout it only guessed at. `confirm` returning false sends
 * the review to the global store instead.
 */
export async function resolveStorageWithConfirmation(
  source: string,
  confirm: (repoPath: string, ownerRepo: string) => Promise<boolean>
): Promise<string> {
  const resolution = await resolveStorageDir(source)

  if (resolution.needsConfirmation && resolution.repoPath) {
    const parsed = parseSource(source)
    const ownerRepo = parsed ? `${parsed.owner}/${parsed.repo}` : source

    const confirmed = await confirm(resolution.repoPath, ownerRepo)

    if (confirmed) {
      resolvedStorageDirs.set(source, resolution.path)
      return resolution.path
    } else {
      resolvedStorageDirs.set(source, GLOBAL_STORAGE_DIR)
      return GLOBAL_STORAGE_DIR
    }
  }

  resolvedStorageDirs.set(source, resolution.path)
  return resolution.path
}

/**
 * The base storage directory for a source: what startup resolved, or else a
 * resolution without asking, for callers that run before or without it.
 */
export async function getStorageDir(source: string): Promise<string> {
  const cached = resolvedStorageDirs.get(source)
  if (cached) {
    return cached
  }

  const resolution = await resolveStorageDir(source)

  // Nobody was asked, so a guessed checkout is not one riff may write into.
  if (resolution.needsConfirmation) {
    return GLOBAL_STORAGE_DIR
  }

  return resolution.path
}

/**
 * Convert a source identifier to a safe directory name.
 * e.g., "gh:owner/repo#123" -> "gh-owner-repo-123"
 *       "local", "@-", "abc123" -> "local"
 *
 * A pull request is a thing with an identity, so its comments are filed
 * under it. A revset is not: `riff`, `riff @-` and `riff abc123` are the
 * same person's notes on the same worktree, and a comment is anchored to a
 * file and a line rather than to the range it happened to be written under.
 * Filing those separately meant writing a note with `riff @-` and opening
 * `riff` to an empty panel.
 */
export function sourceToDir(source: string): string {
  if (!source.startsWith("gh:")) return LOCAL_DIR
  return source
    .replace(/:/g, "-")
    .replace(/\//g, "-")
    .replace(/#/g, "-")
}
