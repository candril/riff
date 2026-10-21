import { $ } from "bun"
import { getCurrentRepoRef } from "../repo"

/**
 * Turn a failed `gh` invocation into something a toast can show.
 *
 * `gh` prints the API's JSON body on **stdout** and only a terse
 * "Validation Failed (HTTP 422)" on stderr, so reading stderr alone loses
 * the one part that says what actually went wrong.
 */
export function extractShellError(err: unknown): string {
  if (err && typeof err === "object") {
    const shellErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string }
    const detail = describeApiError(shellErr.stdout) ?? describeApiError(shellErr.stderr)
    if (detail) return detail

    const stderrStr = shellErr.stderr?.toString().trim()
    if (stderrStr) return stderrStr
    if (shellErr.message) return shellErr.message
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * Known GitHub validation failures, phrased as something the user can act on.
 * Matched on the API's own wording; anything unrecognised passes through.
 */
const API_ERROR_HINTS: { match: RegExp; hint: string }[] = [
  {
    match: /line.*could not be resolved|could not be resolved.*line/i,
    hint: "GitHub can't anchor a comment there — the line is outside the diff",
  },
  {
    match: /one pending review per pull request/i,
    hint: "You already have an unsubmitted review on GitHub — submit or discard it first",
  },
  {
    match: /commit_id.*not.*part of the pull request|no commit found/i,
    hint: "The PR has moved on — refresh (gr) and try again",
  },
]

function describeApiError(buf?: Buffer): string | null {
  if (!buf) return null
  const jsonMatch = buf.toString().match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      message?: string
      errors?: { message?: string; field?: string }[]
    }
    const specific = (parsed.errors ?? [])
      .map((e) => (e.field && e.message ? `${e.field} ${e.message}` : e.message))
      .filter((m): m is string => Boolean(m))

    const raw = specific.length > 0 ? specific.join("; ") : parsed.message
    if (!raw) return null

    return API_ERROR_HINTS.find((h) => h.match.test(raw))?.hint ?? raw
  } catch {
    return null
  }
}

/**
 * Wrap gh CLI commands with user-friendly error messages
 */
export async function safeGhCommand<T>(cmd: () => Promise<T>): Promise<T> {
  try {
    return await cmd()
  } catch (error) {
    const msg = String(error)

    if (msg.includes("gh auth login")) {
      throw new Error("Not logged in to GitHub. Run: gh auth login")
    }
    if (msg.includes("Could not resolve")) {
      throw new Error("PR not found. Check the PR number and repository.")
    }
    if (msg.includes("not a git repository")) {
      throw new Error("Not in a git repository. Specify full repo: riff gh:owner/repo#123")
    }

    // Anything else carries GitHub's own words out. A Bun ShellError's
    // `message` is only "Failed with exit code 1", so a failure that
    // reached the reader said nothing at all about what went wrong — the
    // body is on stdout or stderr, and `extractShellError` reads both.
    // The streams and the original travel along for whoever wants them.
    const detailed = new Error(extractShellError(error), { cause: error })
    const shellErr = error as { stdout?: Buffer; stderr?: Buffer }
    Object.assign(detailed, { stdout: shellErr?.stdout, stderr: shellErr?.stderr })
    throw detailed
  }
}

/**
 * Explain a failed `gh` call in terms the user can act on, for the paths
 * that surface straight into a toast.
 */
export async function describeGhFailure(error: unknown): Promise<string> {
  const text = extractShellError(error)

  if (/rate limit/i.test(text)) {
    const resetAt = await rateLimitResetTime()
    return resetAt
      ? `GitHub API rate limit exceeded — resets at ${resetAt}`
      : "GitHub API rate limit exceeded"
  }
  if (/gh auth login/i.test(text)) {
    return "Not logged in to GitHub — run: gh auth login"
  }
  if (/\b404\b|not found/i.test(text)) {
    return "Not on GitHub at this revision"
  }

  return text.split("\n").find((line) => line.trim())?.trim() || "Unknown error"
}

/**
 * When the soonest-exhausted quota comes back, as a local clock time.
 * "Try again later" is useless without a number, and `gh api rate_limit` is
 * itself unmetered so asking costs nothing.
 */
async function rateLimitResetTime(): Promise<string | null> {
  const result = await $`gh api rate_limit`.quiet().nothrow()
  if (result.exitCode !== 0) return null

  try {
    const resources = JSON.parse(result.stdout.toString()).resources as Record<
      string,
      { remaining: number; reset: number }
    >
    // GraphQL and REST reset on separate clocks; the earliest exhausted one
    // is the honest answer to "when can I retry".
    const resets = Object.values(resources)
      .filter((r) => r.remaining === 0)
      .map((r) => r.reset)
    if (resets.length === 0) return null
    return new Date(Math.min(...resets) * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return null
  }
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Get current repo's owner and name from gh CLI
 */
export async function getCurrentRepo(): Promise<{ owner: string; repo: string }> {
  const ref = await getCurrentRepoRef()
  if (!ref) {
    throw new Error("Not in a git repository. Specify full repo: riff gh:owner/repo#123")
  }
  return ref
}

/**
 * Get current GitHub username
 */
export async function getCurrentUser(): Promise<string> {
  try {
    const result = await $`gh api user --jq .login`.text()
    return result.trim()
  } catch {
    return "@you"
  }
}
