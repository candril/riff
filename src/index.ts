// OTUI_TREE_SITTER_WORKER_PATH is defined at compile time via build script
// This allows the tree-sitter worker to be found in compiled binaries

import { createApp } from "./app"
import { loadPrSession, type PrInfo } from "./providers/github"
import { resolveCurrentPr } from "./providers/current-pr"
import { resolveStorageWithConfirmation } from "./storage"
import * as readline from "readline"
import packageJson from "../package.json"

// ============================================================================
// Version
// ============================================================================

const VERSION = packageJson.version

// ============================================================================
// CLI Help
// ============================================================================

const HELP_TEXT = `
\x1b[1mriff\x1b[0m - Terminal-based code review companion

\x1b[1mUSAGE\x1b[0m
    riff [OPTIONS] [TARGET]

\x1b[1mDESCRIPTION\x1b[0m
    Review code changes with minimal distractions. Supports GitHub PRs (via gh
    CLI) and local changes (commits, branches, jj revsets).

    Comments are stored locally in .riff/ and can be synced to GitHub when ready.

\x1b[1mTARGETS\x1b[0m
    \x1b[36m(no argument)\x1b[0m              Review uncommitted changes (working directory)
    \x1b[36mpr\x1b[0m                        Review PR for current branch/bookmark
    \x1b[36m<pr-number>\x1b[0m               Review GitHub PR in current repo (e.g., 123 or #123)
    \x1b[36m<revision>\x1b[0m                Review local commits (e.g., HEAD~3, main..HEAD, @-)
    \x1b[36mgh:<owner>/<repo>#<pr>\x1b[0m   Review PR from any GitHub repository
    \x1b[36m<github-url>\x1b[0m              Review PR from GitHub URL

\x1b[1mEXAMPLES\x1b[0m
    \x1b[2m# Review uncommitted changes\x1b[0m
    $ riff

    \x1b[2m# Review PR for the current branch/bookmark\x1b[0m
    $ riff pr

    \x1b[2m# Review a PR in the current repo\x1b[0m
    $ riff 123
    $ riff #123

    \x1b[2m# Review last 3 commits\x1b[0m
    $ riff HEAD~3

    \x1b[2m# Review changes between branches\x1b[0m
    $ riff main..feature-branch

    \x1b[2m# Review jj revset (parent change)\x1b[0m
    $ riff @-

    \x1b[2m# Review PR from any repo\x1b[0m
    $ riff gh:facebook/react#1234
    $ riff https://github.com/facebook/react/pull/1234

\x1b[1mOPTIONS\x1b[0m
    \x1b[33m-h, --help\x1b[0m                Show this help message
    \x1b[33m-v, --version\x1b[0m             Show version number

\x1b[1mKEYBOARD SHORTCUTS\x1b[0m
    \x1b[1mNavigation\x1b[0m
    j/k                       Scroll down/up
    h/l                       Scroll left/right
    Ctrl+d / Ctrl+u           Half page down/up
    Ctrl+f / Ctrl+b           Full page down/up
    gg / G                    Go to top/bottom
    ]c / [c                   Next/previous hunk
    ]f / [f                   Next/previous file
    ]F / [F                   Next/previous unreviewed file

    \x1b[1mPanels\x1b[0m
    Ctrl+n                    Toggle file tree panel
    Ctrl+p                    Focus file tree panel
    Enter                     Select file (in file tree)
    Tab                       Toggle between panels

    \x1b[1mReview Actions\x1b[0m
    v                         Toggle file as viewed
    V                         Mark all files as viewed
    c                         Add comment on current line
    e                         Edit comment under cursor
    d                         Delete comment under cursor
    Ctrl+/                    Toggle comment resolved status

    \x1b[1mViews & Search\x1b[0m
    Ctrl+k                    Open omni search (files, symbols, actions)
    /                         Search in current view
    n / N                     Next/previous search match
    o                         Open file in external editor
    i                         Show PR info panel

    \x1b[1mActions\x1b[0m
    Space                     Open action picker
    R                         Refresh data from source
    Ctrl+s                    Submit pending comments to GitHub
    ?                         Show help
    q                         Quit

\x1b[1mCONFIGURATION\x1b[0m
    Config file: ~/.config/riff/config.toml

    Environment variables:
    \x1b[33mRIFF_CONFIG\x1b[0m               Override config file path
    \x1b[33mEDITOR\x1b[0m                    Editor for opening files (default: $VISUAL or vim)

    Storage config example:
    \x1b[2m[storage]
    basePath = "~/code"  # Auto-detect repos here

    [storage.repos]
    "owner/repo" = "~/code/repo"  # Explicit mapping\x1b[0m

    Ignore patterns example:
    \x1b[2m[ignore]
    patterns = ["package-lock.json", "*.generated.*"]\x1b[0m

\x1b[1mSTORAGE\x1b[0m
    Comments and session data are stored in:
    - \x1b[36m<repo>/.riff/\x1b[0m           When inside a git/jj repository
    - \x1b[36m~/.riff/\x1b[0m                Global fallback for non-repo contexts

    For remote PRs, riff uses configured repo mappings or auto-detects
    local clones via the storage.basePath config option.

\x1b[1mREQUIREMENTS\x1b[0m
    - \x1b[33mgh\x1b[0m CLI (for GitHub PR features): https://cli.github.com/
    - \x1b[33mgit\x1b[0m or \x1b[33mjj\x1b[0m (for local diff features)

`

/**
 * Print help message and exit
 */
function printHelp(): void {
  console.log(HELP_TEXT.trim())
  process.exit(0)
}

/**
 * Print version and exit
 */
function printVersion(): void {
  console.log(`riff ${VERSION}`)
  process.exit(0)
}

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

  // Flags
  help?: boolean
  version?: boolean
}

/**
 * Parse CLI arguments to determine mode and target
 */
export function parseArgs(args: string[]): CliArgs {
  // Check for flags first
  if (args.includes("-h") || args.includes("--help")) {
    return { type: "local", help: true }
  }
  if (args.includes("-v") || args.includes("--version")) {
    return { type: "local", version: true }
  }

  // Filter out any remaining flags (for future extensibility)
  const positionalArgs = args.filter((arg) => !arg.startsWith("-"))
  const target = positionalArgs[0]

  if (!target) {
    return { type: "local" }
  }

  // Current branch's PR: "pr"
  if (target === "pr") {
    return { target, type: "pr" }
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

  // Handle flags
  if (args.help) {
    printHelp()
  }
  if (args.version) {
    printVersion()
  }

  try {
    if (args.type === "pr") {
      if (!args.prNumber) {
        console.log("Resolving PR for current branch...")
        args.prNumber = await resolveCurrentPr()
      }
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
