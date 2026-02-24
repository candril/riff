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
