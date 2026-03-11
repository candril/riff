import { $ } from "bun"
import type { PrCommit } from "./github"

export type VcsType = "git" | "jj" | "none"

/**
 * Detect which version control system is in use
 */
export async function detectVcs(): Promise<VcsType> {
  try {
    // Check for jj first (it also has .git)
    const jjResult = await $`jj root`.quiet().nothrow()
    if (jjResult.exitCode === 0) {
      return "jj"
    }
  } catch {
    // jj not installed or not a jj repo
  }

  try {
    const gitResult = await $`git rev-parse --git-dir`.quiet().nothrow()
    if (gitResult.exitCode === 0) {
      return "git"
    }
  } catch {
    // git not installed or not a git repo
  }

  return "none"
}

/**
 * Get diff for local changes
 */
export async function getLocalDiff(target?: string): Promise<string> {
  const vcs = await detectVcs()

  if (vcs === "none") {
    throw new Error("Not in a git or jj repository")
  }

  if (vcs === "jj") {
    return getJjDiff(target)
  }

  return getGitDiff(target)
}

/**
 * Get diff using jj
 * Uses default context (3 lines) - expand functionality shows more on demand
 */
async function getJjDiff(target?: string): Promise<string> {
  if (!target) {
    // All changes from trunk to working copy
    const result = await $`jj diff --git --from ${"trunk()"}`.text()
    return result
  }

  // Support jj revsets
  return await $`jj diff --git -r ${target}`.text()
}

/**
 * Get diff using git
 * Uses default context (3 lines) - expand functionality shows more on demand
 */
async function getGitDiff(target?: string): Promise<string> {
  if (!target) {
    // Uncommitted changes (staged + unstaged)
    let result = await $`git diff`.text()
    if (!result.trim()) {
      // Try staged changes
      result = await $`git diff --cached`.text()
    }
    if (!result.trim()) {
      // Try diff against HEAD (for committed but unpushed)
      result = await $`git diff HEAD`.text()
    }
    return result
  }

  if (target.startsWith("branch:")) {
    const branch = target.slice(7)
    return await $`git diff ${branch}...HEAD`.text()
  }

  // Commit or range
  return await $`git diff ${target}`.text()
}

/**
 * Get branch/bookmark info for display in header.
 * Returns something like "my-feature → main" for jj/git.
 */
export async function getBranchInfo(target?: string): Promise<string | null> {
  const vcs = await detectVcs()

  try {
    if (vcs === "jj") {
      // Get bookmark on current change (or nearest ancestor)
      const currentBookmark = await $`jj log -r 'latest(::@ & bookmarks())' --no-graph -T 'bookmarks.map(|b| b.name()).join(", ")'`.nothrow()
      const trunkBookmark = await $`jj log -r 'trunk()' --no-graph -T 'bookmarks.map(|b| b.name()).join(", ")'`.nothrow()

      const current = currentBookmark.exitCode === 0 ? currentBookmark.text().trim() : ""
      const trunk = trunkBookmark.exitCode === 0 ? trunkBookmark.text().trim() : ""

      if (current && trunk && current !== trunk) {
        return `${current} → ${trunk}`
      } else if (current) {
        return current
      } else if (trunk) {
        return `→ ${trunk}`
      }
      return null
    }

    if (vcs === "git") {
      const branch = await $`git branch --show-current`.nothrow()
      const current = branch.exitCode === 0 ? branch.text().trim() : ""
      if (current) {
        return current
      }
    }
  } catch {
    // Ignore errors
  }

  return null
}

/**
 * Get description of what we're diffing
 */
export async function getDiffDescription(target?: string): Promise<string> {
  const vcs = await detectVcs()

  if (vcs === "jj") {
    if (!target) {
      // Get current change description, or fall back to branch description
      try {
        const desc = await $`jj log -r @ --no-graph -T description`.text()
        return desc.trim() || "Changes since trunk"
      } catch {
        return "Changes since trunk"
      }
    }
    return `Revision: ${target}`
  }

  if (!target) {
    return "Uncommitted changes"
  }

  if (target.startsWith("branch:")) {
    return `Changes from ${target.slice(7)}`
  }

  return `Diff: ${target}`
}

/**
 * Get full file content from working directory or a specific revision
 * Returns the "new" version of the file (after changes)
 */
export async function getFileContent(
  filename: string,
  target?: string
): Promise<string | null> {
  const vcs = await detectVcs()

  if (vcs === "none") {
    return null
  }

  try {
    if (vcs === "jj") {
      return await getJjFileContent(filename, target)
    }
    return await getGitFileContent(filename, target)
  } catch {
    return null
  }
}

/**
 * Get file content using jj
 */
async function getJjFileContent(filename: string, target?: string): Promise<string> {
  if (!target) {
    // Current working copy version
    const result = await $`jj file show ${filename}`.nothrow()
    if (result.exitCode !== 0) {
      // Try reading from working directory directly
      const file = Bun.file(filename)
      if (await file.exists()) {
        return await file.text()
      }
      throw new Error(`File not found: ${filename}`)
    }
    return result.text()
  }

  // Specific revision
  const result = await $`jj file show ${filename} -r ${target}`.text()
  return result
}

/**
 * Get file content using git
 */
async function getGitFileContent(filename: string, target?: string): Promise<string> {
  if (!target) {
    // Try working directory first (includes uncommitted changes)
    const file = Bun.file(filename)
    if (await file.exists()) {
      return await file.text()
    }
    // Fall back to HEAD
    return await $`git show HEAD:${filename}`.text()
  }

  if (target.startsWith("branch:")) {
    const branch = target.slice(7)
    return await $`git show ${branch}:${filename}`.text()
  }

  // Specific commit
  return await $`git show ${target}:${filename}`.text()
}

/**
 * Get the "old" version of a file (before changes)
 * For local diffs, this is HEAD or parent commit
 */
export async function getOldFileContent(
  filename: string,
  target?: string
): Promise<string | null> {
  const vcs = await detectVcs()

  if (vcs === "none") {
    return null
  }

  try {
    if (vcs === "jj") {
      // For jj, the "old" version is trunk (or parent of target)
      const revision = target ? `${target}-` : "trunk()"
      return await $`jj file show ${filename} -r ${revision}`.text()
    }

    // For git, the "old" version is HEAD (or base of comparison)
    if (!target) {
      return await $`git show HEAD:${filename}`.text()
    }

    if (target.startsWith("branch:")) {
      const branch = target.slice(7)
      return await $`git show ${branch}:${filename}`.text()
    }

    // For a commit range like "abc123..def456", get the first commit
    if (target.includes("..")) {
      const base = target.split("..")[0]
      return await $`git show ${base}:${filename}`.text()
    }

    // Single commit - get its parent
    return await $`git show ${target}^:${filename}`.text()
  } catch {
    return null
  }
}

// ============================================================================
// Local Commit Enumeration
// ============================================================================

/**
 * List commits in the local diff range.
 * Returns commits in newest-first order matching PrCommit shape.
 */
export async function getLocalCommits(target?: string): Promise<PrCommit[]> {
  const vcs = await detectVcs()

  if (vcs === "jj") {
    return getJjCommits(target)
  }
  if (vcs === "git") {
    return getGitCommits(target)
  }
  return []
}

/**
 * Get commits from jj between trunk and working copy
 */
async function getJjCommits(target?: string): Promise<PrCommit[]> {
  try {
    const revset = target || "trunk()..@"
    // Use template to get structured output (NUL-separated fields, newline-separated records)
    const template = 'commit_id.short(7) ++ "\\x00" ++ description.first_line() ++ "\\x00" ++ author.name() ++ "\\x00" ++ author.timestamp().utc().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\n"'
    const result = await $`jj log -r ${revset} --no-graph -T ${template}`.nothrow()
    if (result.exitCode !== 0) return []

    const lines = result.text().trim().split("\n").filter(Boolean)
    return lines.map((line) => {
      const [sha = "", message = "", author = "", date = ""] = line.split("\x00")
      return { sha, message, author, date }
    })
  } catch {
    return []
  }
}

/**
 * Get commits from git in the diff range
 */
async function getGitCommits(target?: string): Promise<PrCommit[]> {
  try {
    let range: string
    if (target) {
      if (target.startsWith("branch:")) {
        range = `${target.slice(7)}..HEAD`
      } else if (target.includes("..")) {
        range = target
      } else {
        // Single commit — just that one
        range = `${target}~1..${target}`
      }
    } else {
      // Default: commits on current branch not on main/master
      // Try main first, fall back to master
      const mainCheck = await $`git rev-parse --verify main`.quiet().nothrow()
      const baseBranch = mainCheck.exitCode === 0 ? "main" : "master"
      range = `${baseBranch}..HEAD`
    }

    const format = "%h%x00%s%x00%an%x00%aI"
    const result = await $`git log ${range} --format=${format}`.nothrow()
    if (result.exitCode !== 0) return []

    const lines = result.text().trim().split("\n").filter(Boolean)
    return lines.map((line) => {
      const [sha = "", message = "", author = "", date = ""] = line.split("\x00")
      return { sha, message, author, date }
    })
  } catch {
    return []
  }
}

/**
 * Fetch the diff for a specific local commit
 */
export async function getLocalCommitDiff(sha: string, target?: string): Promise<string> {
  const vcs = await detectVcs()

  if (vcs === "jj") {
    // For jj, the sha is a short commit id
    const result = await $`jj diff --git -r ${sha}`.nothrow()
    if (result.exitCode !== 0) return ""
    return result.text()
  }

  // git: show just the diff for that commit
  const result = await $`git show ${sha} --format= --patch`.nothrow()
  if (result.exitCode !== 0) return ""
  return result.text()
}
