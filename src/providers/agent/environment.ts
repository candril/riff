import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// Either variable silently moves the agent off the subscription login onto API billing.
const STRIPPED = new Set(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"])

export function agentEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !STRIPPED.has(entry[0]),
    ),
  )
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
