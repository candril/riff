export interface ClaudeVersion {
  major: number
  minor: number
  patch: number
}

export interface ClaudeVersionNote {
  text: string
  tone: "error" | "info"
}

// Stamped by scripts/build.ts from the agent SDK's package.json: the claude it was built against.
declare const RIFF_CLAUDE_CODE_VERSION: string

export const pinnedClaudeVersion: string | undefined =
  typeof RIFF_CLAUDE_CODE_VERSION !== "undefined" ? RIFF_CLAUDE_CODE_VERSION : undefined

export const CLAUDE_MISSING = "claude is not installed; riff's agent runs the claude CLI"

export function parseClaudeVersion(stdout: string): ClaudeVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?: \(Claude Code\))?$/.exec(stdout.trim())
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

const show = (v: ClaudeVersion) => `${v.major}.${v.minor}.${v.patch}`

/**
 * A newer patch counts as agreeing: claude auto-updates patches constantly, and a note
 * on every one would teach the reviewer to ignore it.
 */
export function versionDrift(installed: ClaudeVersion, pinned: ClaudeVersion): string | null {
  const agrees = installed.major === pinned.major && installed.minor === pinned.minor && installed.patch >= pinned.patch
  if (agrees) return null
  return `claude ${show(installed)} is installed; riff's agent is built for ${show(pinned)} and may not work until they match`
}

export interface CheckDeps {
  executable: { path?: string; missing: boolean }
  pinned: string
  /** Returns claude's `--version` output, or throws. */
  run: (path: string) => Promise<string>
}

export async function checkClaudeVersion({ executable, pinned, run }: CheckDeps): Promise<ClaudeVersionNote | null> {
  if (executable.missing) return { text: CLAUDE_MISSING, tone: "error" }
  // Without a path the SDK runs its own bundled claude, which matches by construction.
  if (!executable.path) return null
  const unreadable: ClaudeVersionNote = { text: "could not read claude's version", tone: "info" }
  const installed = parseClaudeVersion(await run(executable.path).catch(() => ""))
  const expected = parseClaudeVersion(pinned)
  if (!installed || !expected) return unreadable
  const drift = versionDrift(installed, expected)
  return drift ? { text: drift, tone: "info" } : null
}

const VERSION_TIMEOUT_MS = 5000

export async function claudeVersionOutput(path: string): Promise<string> {
  const proc = Bun.spawn([path, "--version"], { stdout: "pipe", stderr: "ignore", stdin: "ignore" })
  const timer = setTimeout(() => proc.kill(), VERSION_TIMEOUT_MS)
  try {
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (code !== 0) throw new Error(`claude --version exited with ${code}`)
    return stdout
  } finally {
    clearTimeout(timer)
  }
}
