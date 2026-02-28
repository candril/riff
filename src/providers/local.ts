import { $ } from "bun"

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
    // Current change diff
    const result = await $`jj diff --git`.text()
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
 * Get description of what we're diffing
 */
export async function getDiffDescription(target?: string): Promise<string> {
  const vcs = await detectVcs()

  if (vcs === "jj") {
    if (!target) {
      // Get current change description
      try {
        const desc = await $`jj log -r @ --no-graph -T description`.text()
        return desc.trim() || "Current change"
      } catch {
        return "Current change"
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
      // For jj, the "old" version is the parent of current change
      const revision = target ? `${target}-` : "@-"
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
