import { expect, test } from "bun:test"
import { checkClaudeVersion, parseClaudeVersion, versionDrift } from "./claude-version"

const PINNED = "2.1.296"
const at = (stdout: string) => () => Promise.resolve(stdout)
const check = (run: (path: string) => Promise<string>) =>
  checkClaudeVersion({ executable: { path: "/usr/local/bin/claude", missing: false }, pinned: PINNED, run })

test("claude's --version output parses; anything else does not", () => {
  expect(parseClaudeVersion("2.1.306 (Claude Code)\n")).toEqual({ major: 2, minor: 1, patch: 306 })
  expect(parseClaudeVersion("2.1.296")).toEqual({ major: 2, minor: 1, patch: 296 })
  expect(parseClaudeVersion("")).toBeNull()
  expect(parseClaudeVersion("claude: command not found")).toBeNull()
  expect(parseClaudeVersion("2.1 (Claude Code)")).toBeNull()
})

test("the same version, or a newer patch, agrees", async () => {
  expect(await check(at("2.1.296 (Claude Code)"))).toBeNull()
  expect(await check(at("2.1.306 (Claude Code)"))).toBeNull()
})

test("an older patch, another minor or another major drifts, and the note names both versions", async () => {
  expect(await check(at("2.1.290 (Claude Code)"))).toEqual({
    text: "claude 2.1.290 is installed; riff's agent is built for 2.1.296 and may not work until they match",
    tone: "info",
  })
  expect((await check(at("2.2.0 (Claude Code)")))?.text).toContain("claude 2.2.0 is installed")
  expect((await check(at("2.0.400 (Claude Code)")))?.text).toContain("claude 2.0.400 is installed")
  expect((await check(at("3.1.296 (Claude Code)")))?.text).toContain("claude 3.1.296 is installed")
  expect(versionDrift({ major: 3, minor: 0, patch: 0 }, { major: 2, minor: 1, patch: 296 })).not.toContain("\n")
})

test("unparseable output or a failing spawn says the version could not be read", async () => {
  const unreadable = { text: "could not read claude's version", tone: "info" as const }
  expect(await check(at("something else"))).toEqual(unreadable)
  expect(await check(() => Promise.reject(new Error("timed out")))).toEqual(unreadable)
})

test("a missing claude is an error, and nothing is spawned", async () => {
  let spawned = 0
  const note = await checkClaudeVersion({
    executable: { missing: true },
    pinned: PINNED,
    run: () => (spawned++, Promise.resolve("")),
  })
  expect(note).toEqual({ text: "claude is not installed; riff's agent runs the claude CLI", tone: "error" })
  expect(spawned).toBe(0)
})

test("without a path the SDK's own claude runs, and nothing is spawned", async () => {
  let spawned = 0
  const note = await checkClaudeVersion({
    executable: { missing: false },
    pinned: PINNED,
    run: () => (spawned++, Promise.resolve("1.0.0 (Claude Code)")),
  })
  expect([note, spawned]).toEqual([null, 0])
})
