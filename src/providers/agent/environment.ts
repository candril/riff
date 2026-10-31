import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const STRIPPED = new Set([
  // Each silently moves the agent off the subscription login: the first two onto API billing,
  // CLAUDE_CODE_SIMPLE (bare mode) by skipping OAuth.
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_SIMPLE",
  // propose_comment and propose_edit wait for the reviewer, however long that takes.
  "MCP_TOOL_TIMEOUT",
])

const PINNED = {
  // riff's few tools would otherwise sit behind a tool search, a round trip before every first call.
  ENABLE_TOOL_SEARCH: "false",
  // The agent answers about one review; notes it keeps would follow it into the next.
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
}

export function agentEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const inherited = Object.entries(env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !STRIPPED.has(entry[0]),
  )
  return { ...Object.fromEntries(inherited), ...PINNED }
}

// The agent never runs inside the reviewed repository: the claude_code preset would describe
// that directory's git state to it, and it has no business there.
export function agentDirectory(): string {
  const state = process.env["XDG_STATE_HOME"] || join(homedir(), ".local/state")
  const dir = join(state, "riff", "agent")
  mkdirSync(dir, { recursive: true })
  return dir
}

// A compiled riff cannot spawn the SDK's bundled claude from inside its own binary, and
// embedding it would add 240 MB; it runs the user's installed claude instead. Under `bun run`
// the SDK's own copy is used.
export function claudeExecutable(): { path?: string; missing: boolean } {
  if (!Bun.main.startsWith("/$bunfs")) {
    return { missing: false }
  }
  const path = Bun.which("claude")
  return path ? { path, missing: false } : { missing: true }
}
