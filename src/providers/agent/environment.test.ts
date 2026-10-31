import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { agentDirectory, agentEnv } from "./environment"

const savedState = process.env["XDG_STATE_HOME"]
let root: string | undefined

afterEach(() => {
  if (savedState === undefined) delete process.env["XDG_STATE_HOME"]
  else process.env["XDG_STATE_HOME"] = savedState
  if (root) rmSync(root, { recursive: true, force: true })
})

test("strips the variables that move the agent off the subscription login", () => {
  const env = agentEnv({
    PATH: "/bin",
    ANTHROPIC_API_KEY: "sk",
    ANTHROPIC_AUTH_TOKEN: "t",
    CLAUDE_CODE_SIMPLE: "1",
    HOME: "/h",
  })
  expect(env).toMatchObject({ PATH: "/bin", HOME: "/h" })
  expect(env).not.toContainKeys(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_SIMPLE"])
})

test("a shell's tool timeout does not cut short a proposal waiting for the reviewer", () => {
  expect(agentEnv({ MCP_TOOL_TIMEOUT: "30000" })).not.toContainKey("MCP_TOOL_TIMEOUT")
})

test("tool search and auto-memory stay off, whatever the shell sets", () => {
  const env = agentEnv({ ENABLE_TOOL_SEARCH: "true", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0" })
  expect(env).toMatchObject({ ENABLE_TOOL_SEARCH: "false", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" })
})

test("the agent's directory is riff's own, under the state home, and exists", () => {
  root = mkdtempSync(join(tmpdir(), "riff-agent-"))
  process.env["XDG_STATE_HOME"] = root
  const dir = agentDirectory()
  expect(dir).toBe(join(root, "riff", "agent"))
  expect(existsSync(dir)).toBe(true)
})
