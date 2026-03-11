// OTUI_TREE_SITTER_WORKER_PATH is defined at compile time via build script
// This allows the tree-sitter worker to be found in compiled binaries

import { createApp } from "./app"
import { loadPrSession, type PrInfo } from "./providers/github"
import { resolveStorageWithConfirmation } from "./storage"
import * as readline from "readline"

// ============================================================================
// CLI Argument Parsing
// ============================================================================

export interface CliArgs {
  target?: string // "123", "#123", "gh:owner/repo#123", URL, or revision
  type: "local" | "pr" // Detected source type

  // For PR mode
  prNumber?: number
  owner?: string
  repo?: string
}

/**
 * Parse CLI arguments to determine mode and target
 */
export function parseArgs(args: string[]): CliArgs {
  const target = args[0]

  if (!target) {
    return { type: "local" }
  }

  // PR number: "#123" or "123"
  const prMatch = target.match(/^#?(\d+)$/)
  if (prMatch) {
    return {
      target,
      type: "pr",
      prNumber: parseInt(prMatch[1]!, 10),
      // owner/repo inferred from current directory
    }
  }

  // Full reference: "gh:owner/repo#123"
  const ghMatch = target.match(/^gh:([^/]+)\/([^#]+)#(\d+)$/)
  if (ghMatch) {
    return {
      target,
      type: "pr",
      owner: ghMatch[1],
      repo: ghMatch[2],
      prNumber: parseInt(ghMatch[3]!, 10),
    }
  }

  // GitHub URL
  const urlMatch = target.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (urlMatch) {
    return {
      target,
      type: "pr",
      owner: urlMatch[1],
      repo: urlMatch[2],
      prNumber: parseInt(urlMatch[3]!, 10),
    }
  }

  // Otherwise treat as local revision (branch, commit, jj revset)
  return { target, type: "local" }
}

// ============================================================================
// User Confirmation Prompt
// ============================================================================

/**
 * Prompt user for confirmation (Y/n)
 */
async function promptConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question(message, (answer) => {
      rl.close()
      // Default to yes if empty, only "n" or "no" means no
      const normalized = answer.trim().toLowerCase()
      resolve(normalized !== "n" && normalized !== "no")
    })
  })
}

/**
 * Confirm storage location with user if auto-detected via basePath
 */
async function confirmStorageLocation(source: string): Promise<void> {
  await resolveStorageWithConfirmation(source, async (repoPath, ownerRepo) => {
    console.log(`\nFound local clone for ${ownerRepo}:`)
    console.log(`  ${repoPath}`)
    const confirmed = await promptConfirm("Use this location? [Y/n] ")
    console.log() // blank line before TUI starts
    return confirmed
  })
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2))

  try {
    if (args.type === "pr") {
      // Fetch PR and persist comments to markdown files
      console.log(`Fetching PR #${args.prNumber}...`)
      const { prInfo, diff, comments, viewedStatuses, headSha } = await loadPrSession(
        args.prNumber!,
        args.owner,
        args.repo
      )

      // Build source identifier and confirm storage location
      const source = `gh:${prInfo.owner}/${prInfo.repo}#${prInfo.number}`
      await confirmStorageLocation(source)

      await createApp({
        mode: "pr",
        diff,
        comments,
        prInfo,
        githubViewedStatuses: viewedStatuses,
        headSha,
      })
    } else {
      // Local diff mode - confirm storage for local source
      const source = args.target ?? "local"
      await confirmStorageLocation(source)

      await createApp({
        mode: "local",
        target: args.target,
      })
    }
  } catch (error) {
    console.error("Failed to start riff:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
