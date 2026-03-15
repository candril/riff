/**
 * Repository path resolution utilities
 *
 * Finds local checkout paths for GitHub repositories using:
 * 1. Explicit mapping in config: storage.repos["owner/repo"]
 * 2. Base path + repo short name: storage.basePath + "repo-name"
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Config } from "../config/schema"

/**
 * Expand ~ to home directory
 */
export function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2))
  }
  return path
}

/**
 * Find local path for a repository
 *
 * Resolution order:
 * 1. Explicit mapping: storage.repos["owner/repo"]
 * 2. Base path: storage.basePath + repo short name
 *
 * @param repoName - Full repo name "owner/repo"
 * @param config - Riff configuration
 * @returns Local path if found, null otherwise
 */
export function findLocalRepoPath(
  repoName: string,
  config: Config
): string | null {
  const repoShortName = repoName.split("/")[1] || repoName

  // 1. Check explicit mapping
  if (config.storage.repos[repoName]) {
    const path = expandHome(config.storage.repos[repoName])
    if (existsSync(path)) return path
  }

  // 2. Check base path
  if (config.storage.basePath) {
    const path = join(expandHome(config.storage.basePath), repoShortName)
    if (existsSync(path)) return path
  }

  return null
}

export interface CheckoutResult {
  success: boolean
  message: string
  branch?: string
}

/**
 * Checkout a PR locally using gh CLI
 *
 * @param prNumber - PR number
 * @param repoName - Full repo name "owner/repo"
 * @param localPath - Local path to the repo checkout
 * @returns Result with success status and message
 */
export async function checkoutPR(
  prNumber: number,
  repoName: string,
  localPath: string
): Promise<CheckoutResult> {
  try {
    // Run checkout in the repo directory
    const result = await Bun.spawn(
      ["gh", "pr", "checkout", String(prNumber), "-R", repoName],
      {
        cwd: localPath,
        stdout: "pipe",
        stderr: "pipe",
      }
    )

    const exitCode = await result.exited
    const stdout = await new Response(result.stdout).text()
    const stderr = await new Response(result.stderr).text()

    if (exitCode !== 0) {
      return {
        success: false,
        message: stderr.trim() || "Checkout failed",
      }
    }

    // Extract branch name from output (gh outputs: "Switched to branch 'branch-name'")
    const branchMatch = stdout.match(/Switched to branch '([^']+)'/)
    const branch = branchMatch?.[1] ?? `pr-${prNumber}`

    return {
      success: true,
      message: `Checked out #${prNumber} -> ${branch}`,
      branch,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      message: `Checkout failed: ${errorMsg}`,
    }
  }
}
