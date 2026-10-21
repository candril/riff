import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  tool,
  type Options,
  type SDKMessage,
  type SDKUserMessage,
  type query,
} from "@anthropic-ai/claude-agent-sdk"
import { TWO_FILES } from "../../testing/diffs"
import { parseDiff } from "../../utils/diff-parser"
import type { AgentEvents, AgentSession } from "./agent"
import { readToolset } from "./read-tool-definitions"
import { READS_PER_ANSWER } from "./read-tools"
import { createClaudeAgent } from "./session"
import type { AgentTool, AgentToolset } from "./tool-server"

type Script = (question: string) => object[]

const savedState = process.env["XDG_STATE_HOME"]
const savedKey = process.env["ANTHROPIC_API_KEY"]
const stateHome = mkdtempSync(join(tmpdir(), "riff-agent-session-"))

// agentDirectory creates its directory, and a test has no business in the user's state home.
beforeAll(() => {
  process.env["XDG_STATE_HOME"] = stateHome
  process.env["ANTHROPIC_API_KEY"] = "sk-test"
})

afterAll(() => {
  if (savedState === undefined) delete process.env["XDG_STATE_HOME"]
  else process.env["XDG_STATE_HOME"] = savedState
  if (savedKey === undefined) delete process.env["ANTHROPIC_API_KEY"]
  else process.env["ANTHROPIC_API_KEY"] = savedKey
  rmSync(stateHome, { recursive: true, force: true })
})

const asked: string[] = []
const started: AgentSession[] = []

afterEach(() => {
  started.splice(0).forEach((session) => session.close())
})

const text = (t: string) => ({
  type: "stream_event",
  event: { type: "content_block_delta", delta: { type: "text_delta", text: t } },
})
const result = (extra: object = {}) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "",
  usage: { input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 },
  ...extra,
})

// Answers each question from the script; `drop` ends the stream the way a dying process does,
// and `run` stands for the model calling tools before it answers.
function fakeQuery(script: Script, seen: { options?: Options; opened: number; interrupts: number }) {
  return ((args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
    seen.options = args.options
    seen.opened++
    async function* run() {
      for await (const message of args.prompt) {
        const question = message.message.content as string
        asked.push(question)
        for (const reply of script(question)) {
          if ("drop" in reply) {
            return
          }
          if ("run" in reply) {
            await (reply as { run: () => Promise<void> }).run()
            continue
          }
          yield reply as SDKMessage
        }
      }
    }
    return Object.assign(run(), {
      interrupt: async () => void seen.interrupts++,
      close: () => {},
    })
  }) as unknown as typeof query
}

const listFiles = tool("list_files", "List the changed files.", {}, async () => ({ content: [] }), {
  alwaysLoad: true,
  annotations: { readOnlyHint: true },
}) as AgentTool

const noTools = (tools: AgentTool[] = []) => (): AgentToolset => ({ definitions: tools, startAnswer: () => {} })

function start(
  script: Script,
  resume?: { id: string; exists: boolean },
  tools: (events: AgentEvents) => AgentToolset = noTools(),
) {
  const seen = { opened: 0, interrupts: 0 } as { options?: Options; opened: number; interrupts: number }
  const log: string[] = []
  const sessions: string[] = []
  let wake: (() => void) | undefined
  // Every answer ends in answerDone or failed; a test waits for that instead of for time.
  const settle = () => new Promise<void>((resolve) => (wake = resolve))
  const settled = (entry: string) => {
    log.push(entry)
    wake?.()
  }
  const events: AgentEvents = {
    text: (t) => log.push(`text:${t}`),
    readFailed: (w) => log.push(`readFailed:${w}`),
    answerDone: (r) => settled(`done:${r.interrupted}:${r.usage?.input}/${r.usage?.output}`),
    failed: (f) => settled(`failed:${JSON.stringify(f)}`),
  }
  const agent = createClaudeAgent({
    model: "claude-opus-5-5",
    context: () => ({
      target: { kind: "local", label: "feature → main", description: "Changes since trunk" },
      files: [],
      hidden: 0,
    }),
    tools,
    query: fakeQuery(script, seen),
    sessionInfo: (async () => (resume?.exists ? { sessionId: resume.id } : undefined)) as never,
  })
  const session = agent.start(
    {
      ...events,
      sessionStarted: (id) => sessions.push(`started:${id.length}`),
      sessionLost: () => sessions.push("lost"),
    },
    resume?.id,
  )
  started.push(session)
  return { session, seen, log, sessions, settle }
}

test("locks the agent down: no built-in tools, no settings, own directory, only riff's tools", async () => {
  const { session, seen, settle } = start(() => [result()], undefined, noTools([listFiles]))
  session.send("hi", null, [])
  await settle()
  const o = seen.options!
  expect(o.tools).toEqual([])
  expect(o.settingSources).toEqual([])
  expect(o.strictMcpConfig).toBe(true)
  expect(o.permissionMode).toBe("dontAsk")
  expect(o.includePartialMessages).toBe(true)
  expect(o.model).toBe("claude-opus-5-5")
  expect(o.cwd).toBe(join(stateHome, "riff", "agent"))
  expect(Object.keys(o.mcpServers ?? {})).toEqual(["riff"])
  expect(o.allowedTools).toEqual(["mcp__riff__list_files"])
  expect(Object.keys(o.env ?? {}).filter((k) => k.startsWith("ANTHROPIC_"))).toEqual([])
  const prompt = o.systemPrompt as { type: string; preset: string; append: string }
  expect(prompt.preset).toBe("claude_code")
  expect(prompt.append).toContain("on feature → main (Changes since trunk)")
})

test("streams text and reports the answer's tokens", async () => {
  const { session, log, settle } = start(() => [text("Short "), text("answer."), result()])
  session.send("what?", null, [])
  await settle()
  expect(log).toEqual(["text:Short ", "text:answer.", "done:false:100/5"])
})

test("an interrupted answer ends marked as interrupted", async () => {
  const { session, seen, log, settle } = start(() => [text("par"), result({ is_error: true })])
  session.send("q", null, [])
  session.interrupt()
  await settle()
  expect(seen.interrupts).toBeGreaterThan(0)
  expect(log.at(-1)).toBe("done:true:100/5")
})

test.each([
  ["authentication_failed", { kind: "not-logged-in" }],
  ["rate_limit", { kind: "usage-limit", resetsAt: "2026-10-12T18:00:00.000Z" }],
  ["model_not_found", { kind: "model-unavailable", model: "claude-opus-5-5" }],
])("maps %s to a failure the chat can name", async (error, failure) => {
  const resets = Date.parse("2026-10-12T18:00:00Z") / 1000
  const { session, log, settle } = start(() => [
    { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: resets } },
    { type: "assistant", error, message: { content: [] } },
    result({ is_error: true }),
  ])
  session.send("q", null, [])
  await settle()
  expect(log).toEqual([`failed:${JSON.stringify(failure)}`])
})

test("a result that says the CLI is not logged in is reported as such", async () => {
  const { session, log, settle } = start(() => [
    result({ is_error: true, result: "Not logged in · Please run /login" }),
  ])
  session.send("q", null, [])
  await settle()
  expect(log).toEqual(['failed:{"kind":"not-logged-in"}'])
})

test("a dropped session is reported, and the next question opens a new one", async () => {
  let calls = 0
  const { session, seen, log, settle } = start(() => (calls++ === 0 ? [{ drop: true }] : [result()]))
  session.send("first", null, [])
  await settle()
  expect(log).toEqual(['failed:{"kind":"session-dropped"}'])
  session.send("second", null, [])
  await settle()
  expect(seen.opened).toBe(2)
  expect(log.at(-1)).toBe("done:false:100/5")
})

test("the position block goes ahead of the question", async () => {
  const { session, settle } = start(() => [result()])
  session.send("what does this do?", {
    path: "a.ts",
    side: "new",
    line: 3,
    excerpt: [{ kind: "added", text: "x", newLine: 3 }],
    cursorIndex: 0,
    label: "a.ts:3",
  }, [])
  await settle()
  expect(asked.at(-1)).toBe(
    "[Reviewer's position: a.ts:3 (new side)]\n>          3 +x\n\nwhat does this do?",
  )
})

test("attachments go between the position block and the question, each set apart by a blank line", async () => {
  const { session, settle } = start(() => [result()])
  session.send(
    "@file @src/b.ts why?",
    { path: "a.ts", excerpt: [], label: "a.ts" },
    ["[@file: the diff of a.ts]\n@@ -1 +1 @@", "[@src/b.ts: its diff]\n@@ -0,0 +1 @@"],
  )
  await settle()
  expect(asked.at(-1)).toBe(
    "[Reviewer's position: a.ts]\n\n[@file: the diff of a.ts]\n@@ -1 +1 @@\n\n[@src/b.ts: its diff]\n@@ -0,0 +1 @@\n\n@file @src/b.ts why?",
  )
})

test("a stored session that still exists is resumed", async () => {
  const { session, seen, sessions, settle } = start(() => [result()], { id: "s-1", exists: true })
  session.send("again", null, [])
  await settle()
  expect(seen.options?.resume).toBe("s-1")
  expect(seen.options?.sessionId).toBeUndefined()
  expect(sessions).toEqual([])
})

test("a stored session the agent no longer has is reported, and a new one starts", async () => {
  const { session, seen, sessions, settle } = start(() => [result()], {
    id: "s-gone",
    exists: false,
  })
  session.send("again", null, [])
  await settle()
  expect(seen.options?.resume).toBeUndefined()
  expect(seen.options?.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  expect(sessions).toEqual(["lost", "started:36"])
})

test("each question gets a fresh read budget, and a failed read reaches the events", async () => {
  let toolset: AgentToolset | undefined
  const call = (name: string, args: Record<string, unknown>) =>
    toolset!.definitions.find((d) => d.name === name)!.handler(args, {})
  const refused: (boolean | undefined)[] = []
  const source = {
    files: () => parseDiff(TWO_FILES),
    hiddenPaths: () => new Set<string>(),
    fileText: async () => {
      throw new Error("GitHub is not reachable")
    },
    tree: async () => [],
    comments: () => [],
  }
  let calls = 0
  const { session, log, settle } = start(
    () => [
      {
        run: async () => {
          const reads = calls++ === 0 ? READS_PER_ANSWER + 1 : 1
          await call("read_file", { path: "a.ts", side: "head" })
          for (let i = 1; i < reads; i++) {
            refused.push((await call("list_files", {})).isError)
          }
        },
      },
      result(),
    ],
    undefined,
    (events) => (toolset = readToolset(source, events)),
  )
  session.send("first", null, [])
  await settle()
  expect(refused.at(-1)).toBe(true)
  expect(refused.slice(0, -1).some(Boolean)).toBe(false)
  expect(log).toContain("readFailed:a.ts at head: GitHub is not reachable")
  refused.length = 0
  session.send("second", null, [])
  await settle()
  expect(log.filter((l) => l.startsWith("readFailed"))).toHaveLength(2)
  expect(log.at(-1)).toBe("done:false:100/5")
})
