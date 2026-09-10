// OTUI_TREE_SITTER_WORKER_PATH is defined at compile time via build script
// This allows the tree-sitter worker to be found in compiled binaries

import { createApp } from "./app"
import { getCurrentRepo, loadPrSession } from "./providers/github"
import { resolveCurrentPr } from "./providers/current-pr"
import { resolveStorageWithConfirmation } from "./storage"
import { runCommentsCli } from "./cli/comments"
import * as readline from "readline"
import { version } from "./version"

// ============================================================================
// Version
// ============================================================================

const VERSION = version

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

\x1b[1mLOCAL COMMENTS\x1b[0m
    \x1b[2mThe comments a review stores in .riff/, from the command line. Never touches GitHub.
    In the app, x marks a local thread resolved — resolved local threads are never
    published — and "Clear Local Comments" (Ctrl+p) deletes them all.\x1b[0m
    riff comments [--json] [TARGET]         List local comments
    riff comments resolve <id> [TARGET]     Mark a thread done (it will never be published)
    riff comments unresolve <id> [TARGET]   Reopen it
    riff comments remove <id> [TARGET]      Delete one comment
    riff comments clear [TARGET]            Delete every local comment
    riff comments install-skill [--global]  Install the Claude Code skill for working through them
                                            (this repo, or ~/.claude for every repo)

    \x1b[2mOr install riff's Claude Code plugin once, for every repo:\x1b[0m
    $ claude plugin marketplace add candril/riff
    $ claude plugin install riff@riff
    \x1b[2mThen, in any Claude session: "look at the riff comments".\x1b[0m

\x1b[1mKEYBOARD SHORTCUTS\x1b[0m
    \x1b[2mPress \x1b[0mg?\x1b[2m in the app for the keymap, \x1b[0mCtrl+p\x1b[2m for every action
    available right now with its shortcut.\x1b[0m

    \x1b[1mNavigation\x1b[0m
    j/k  h/l                  Move down/up, left/right
    w/b/e                     By word
    f/t  ;/,                  Find character on the line, repeat
    Ctrl+d / Ctrl+u           Half page down/up
    gg / G                    Go to top/bottom
    ]c / [c                   Next/previous hunk
    ]f / [f                   Next/previous file
    ]u / [u                   Next/previous unviewed file
    ]o / [o                   Next/previous outdated file (viewed, then changed)
    ]g / [g                   Next/previous commit's diff
    s                         Flash jump — to a match, or a file by its path
    Ctrl+o / Ctrl+i           Jumplist back/forward

    \x1b[1mPanels\x1b[0m
    Ctrl+b                    Toggle file tree panel
    Ctrl+t                    Toggle comments panel
    Ctrl+h / Ctrl+l           Move focus left/right
    Ctrl+e                    Expand focused panel to full width
    Ctrl+f                    Find files (fuzzy)
    Ctrl+g                    Show the current file's path
    /                         Filter the file tree by path (tree focused)
    Backspace                 Clear that filter, from anywhere
    i                         Toggle PR overview / diff (PR mode)
    Esc                       Leave single-file view

    \x1b[1mReviewing\x1b[0m
    v                         Mark file as viewed
    V                         Visual line select
    c / C                     Comment on the line, inline / via $EDITOR
    y / Y                     Yank line or selection, without / with markers
    Enter                     Open the thread here, or reveal context lines
    ]r / [r                   Next/previous comment thread
    ]R / [R                   Same, skipping resolved threads
    gC                        Find a comment (fuzzy, whole review)

    \x1b[1mComments panel\x1b[0m
    x                         Toggle the thread resolved
    r / e / d                 Reply / edit / delete
    y                         Copy a link to the comment
    o                         Open its file in $EDITOR at its line
    S                         Post this comment now (PR mode)

    \x1b[1mWriting a comment\x1b[0m
    Enter / Ctrl-s            Save the draft locally
    Ctrl-p                    Save and publish it now (PR mode)
    Ctrl-j                    Newline
    Ctrl-g                    Continue in $EDITOR
    @                         Mention picker

    \x1b[1mSearch & Folds\x1b[0m
    /  ?                      Search forward/backward
    n / N                     Next/previous match
    *  #                      Search the word under the cursor
    za / zo / zc              Toggle / open / close fold at cursor
    zR / zM                   Open / close every fold

    \x1b[1mGitHub\x1b[0m
    gS                        Submit review (Enter submits, Ctrl-J newline)
    gs                        Sync edits/replies/resolutions to GitHub
    gi                        PR overview panel
    go / gy / gY              Open PR / copy its URL / copy permalink
    gP                        Create PR (local) or edit PR title & body
    gc                        Checkout the PR branch, open the file in $EDITOR

    \x1b[1mGeneral\x1b[0m
    gr                        Refresh diff, commits and comments
    gf / gF                   Follow the link under the cursor / in a tmux window
    gx                        Open the URL under the cursor in a browser
    ge / gE                   Open the current file in $EDITOR / in a tmux window
    gd / gD                   Copy / dismiss a comment Claude drafted
    Ctrl+p                    Action menu
    g?                        Keymap overlay
    q                         Quit

\x1b[1mCONFIGURATION\x1b[0m
    Config file: ~/.config/riff/config.toml

    Environment variables:
    \x1b[33mEDITOR\x1b[0m                    Editor for comments, PR bodies and gf
                              (falls back to $VISUAL, then nvim)
    \x1b[33mGH_REPO\x1b[0m                   owner/repo override for repo detection

    Storage config example:
    \x1b[2m[storage]
    basePath = "~/code"  # Auto-detect repos here

    [storage.repos]
    "owner/repo" = "~/code/repo"  # Explicit mapping\x1b[0m

    Ignore patterns example:
    \x1b[2m[ignore]
    patterns = ["package-lock.json", "*.generated.*"]\x1b[0m

    Background comment poll:
    \x1b[2m[poll]
    interval = 300  # seconds between checks; 0 disables
    onFocus = true  # skip ticks while unfocused, refresh on focus-in
                    # (in local mode this is what re-reads the diff and .riff/)\x1b[0m

    Full documentation: \x1b[36mhttps://candril.github.io/riff/\x1b[0m

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
    // No one to ask: `riff comments` run from a script or a Claude session
    // has no TTY, and a readline prompt there would hang forever. An
    // auto-detected clone is the best guess we have — take it.
    if (!process.stdin.isTTY) {
      console.log(`Using ${repoPath} for ${ownerRepo}`)
      return true
    }
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

/**
 * The storage source id for a CLI target — the same mapping the TUI uses,
 * so `riff comments` sees exactly the comments `riff <target>` shows.
 */
async function resolveSourceForCli(target: string | undefined): Promise<string> {
  const parsed = parseArgs(target ? [target] : [])
  if (parsed.type !== "pr") {
    const source = parsed.target ?? "local"
    await confirmStorageLocation(source)
    return source
  }
  const prNumber = parsed.prNumber ?? (await resolveCurrentPr())
  const { owner, repo } =
    parsed.owner && parsed.repo ? { owner: parsed.owner, repo: parsed.repo } : await getCurrentRepo()
  const source = `gh:${owner}/${repo}#${prNumber}`
  await confirmStorageLocation(source)
  return source
}

async function main() {
  if (process.argv[2] === "comments") {
    try {
      process.exit(await runCommentsCli(process.argv.slice(3), { resolveSource: resolveSourceForCli }))
    } catch (error) {
      console.error("riff comments:", error instanceof Error ? error.message : error)
      process.exit(1)
    }
  }

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

      // Settle storage before fetching: the confirmation prompt is answered
      // up front rather than after a wait, and the resolved path is cached
      // for the comment files the fetch is about to write.
      const { owner, repo } =
        args.owner && args.repo
          ? { owner: args.owner, repo: args.repo }
          : await getCurrentRepo()
      const source = `gh:${owner}/${repo}#${args.prNumber}`
      await confirmStorageLocation(source)

      console.log(`Fetching PR #${args.prNumber}...`)
      const { prInfo, diff, comments, viewedStatuses, headSha } = await loadPrSession(
        args.prNumber!,
        owner,
        repo
      )

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
