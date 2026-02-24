import { createApp } from "./app"
import { loadPrSession, type PrInfo } from "./providers/github"

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
// Main
// ============================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2))

  try {
    if (args.type === "pr") {
      // Fetch PR and persist comments to markdown files
      console.log(`Fetching PR #${args.prNumber}...`)
      const { prInfo, diff, comments } = await loadPrSession(
        args.prNumber!,
        args.owner,
        args.repo
      )

      await createApp({
        mode: "pr",
        diff,
        comments,
        prInfo,
      })
    } else {
      // Local diff mode
      await createApp({
        mode: "local",
        target: args.target,
      })
    }
  } catch (error) {
    console.error("Failed to start neoriff:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
