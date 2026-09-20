import type { FilesTarget } from "../providers/files"
import { statSync } from "node:fs"

export interface CliArgs {
  target?: string // "123", "#123", "gh:owner/repo#123", URL, revision, or path
  type: "local" | "pr" | "files" // Detected source type

  // For file mode (spec 084)
  filesTarget?: FilesTarget

  // For PR mode
  prNumber?: number
  owner?: string
  repo?: string

  // Flags
  help?: boolean
  version?: boolean
  demo?: boolean
}

/**
 * What the filesystem says about a target, so `parseArgs` stays a pure
 * function of its arguments and this answer.
 */
export type PathKind = "file" | "directory" | null

export function probePath(path: string): PathKind {
  try {
    return statSync(path).isDirectory() ? "directory" : "file"
  } catch {
    return null
  }
}

/**
 * Parse CLI arguments to determine mode and target
 */
export function parseArgs(
  args: string[],
  pathKind: (path: string) => PathKind = probePath
): CliArgs {
  // Check for flags first
  if (args.includes("-h") || args.includes("--help")) {
    return { type: "local", help: true }
  }
  if (args.includes("-v") || args.includes("--version")) {
    return { type: "local", version: true }
  }
  // The fixture is built and entered before anything else, so the demo ignores
  // whatever else was typed rather than reviewing the launch directory.
  if (args.includes("--demo")) {
    return { type: "local", demo: true }
  }

  // `-r <rev>` is the way out of the ambiguity below: on a repo that holds a
  // directory named `main`, it says which `main` was meant.
  const forced = args.findIndex((arg) => arg === "-r" || arg === "--revision")
  if (forced !== -1) {
    const revision = args[forced + 1]
    return revision ? { target: revision, type: "local" } : { type: "local" }
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

  // A path that exists is what was meant (spec 084). `main`, `HEAD` and
  // `src` are all names a directory can also have, and the other precedence
  // loses quietly: `riff src/` would open a diff wherever that resolves.
  // The PR forms above match first, so a bare number stays a PR.
  const kind = pathKind(target)
  if (kind) {
    return {
      target,
      type: "files",
      filesTarget: { path: target, directory: kind === "directory" },
    }
  }

  // Otherwise treat as local revision (branch, commit, jj revset)
  return { target, type: "local" }
}
