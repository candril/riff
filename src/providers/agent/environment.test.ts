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
    HOME: "/h",
  })
  expect(env).toEqual({ PATH: "/bin", HOME: "/h" })
})

test("the agent's directory is riff's own, under the state home, and exists", () => {
  root = mkdtempSync(join(tmpdir(), "riff-agent-"))
  process.env["XDG_STATE_HOME"] = root
  const dir = agentDirectory()
  expect(dir).toBe(join(root, "riff", "agent"))
  expect(existsSync(dir)).toBe(true)
})
