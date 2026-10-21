import {
  getSessionInfo,
  query,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk"
import type { Agent, AgentEvents, AgentFailure, AgentSession } from "./agent"
import { CLAUDE_MISSING } from "./claude-version"
import { agentDirectory, agentEnv, claudeExecutable } from "./environment"
import { Inbox } from "./inbox"
import { questionText } from "./question"
import { buildContext } from "./prompt"
import type { AgentFile, AgentTarget } from "./target"
import { SERVER, allowedToolsOf, createToolServer, type AgentTool, type AgentToolset } from "./tool-server"

export interface ClaudeAgentOptions {
  model: string
  // Read when a session opens, so a resumed or reopened session describes the review as it is.
  context: () => { target: AgentTarget; files: readonly AgentFile[]; hidden: number }
  tools: (events: AgentEvents) => AgentToolset
  query?: typeof query
  sessionInfo?: typeof getSessionInfo
}

const LOGIN_ERRORS = new Set([
  "authentication_failed",
  "oauth_org_not_allowed",
  "verification_required",
])

function failureOf(error: string, model: string, resetsAt?: number): AgentFailure {
  if (LOGIN_ERRORS.has(error)) {
    return { kind: "not-logged-in" }
  }
  if (error === "rate_limit") {
    return resetsAt === undefined
      ? { kind: "usage-limit" }
      : { kind: "usage-limit", resetsAt: new Date(resetsAt * 1000).toISOString() }
  }
  if (error === "model_not_found") {
    return { kind: "model-unavailable", model }
  }
  return { kind: "other", message: error }
}

export function sessionOptions(opts: ClaudeAgentOptions, tools: readonly AgentTool[]): Options {
  const executable = claudeExecutable()
  const { target, files, hidden } = opts.context()
  return {
    cwd: agentDirectory(),
    model: opts.model,
    systemPrompt: { type: "preset", preset: "claude_code", append: buildContext(target, files, hidden) },
    tools: [],
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: { [SERVER]: createToolServer(tools) },
    allowedTools: allowedToolsOf(tools),
    permissionMode: "dontAsk",
    includePartialMessages: true,
    env: agentEnv(),
    ...(executable.path ? { pathToClaudeCodeExecutable: executable.path } : {}),
  }
}

type Running = { inbox: Inbox; q: ReturnType<typeof query> }

function startSession(
  opts: ClaudeAgentOptions,
  events: AgentEvents,
  resumeId: string | null,
): AgentSession {
  const toolset = opts.tools(events)
  const run = opts.query ?? query
  let current: Promise<Running | null> | null = null
  let wantResume = resumeId
  let closed = false
  let interrupted = false
  let turnFailed = false
  let resetsAt: number | undefined

  function handle(message: SDKMessage) {
    if (message.type === "stream_event") {
      const event = message.event
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        events.text(event.delta.text)
      }
    } else if (message.type === "rate_limit_event") {
      resetsAt = message.rate_limit_info.resetsAt ?? resetsAt
    } else if (message.type === "assistant" && message.error && !turnFailed) {
      turnFailed = true
      events.failed(failureOf(message.error, opts.model, resetsAt))
    } else if (message.type === "result") {
      if (turnFailed) {
        turnFailed = false
      } else if (message.is_error && !interrupted) {
        const text = "result" in message ? message.result : message.errors.join("; ")
        events.failed(
          /not logged in|\/login/i.test(text)
            ? { kind: "not-logged-in" }
            : { kind: "other", message: text },
        )
      } else {
        const u = message.usage
        const input =
          u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        events.answerDone({ interrupted, usage: { input, output: u.output_tokens } })
      }
    }
  }

  async function consume(running: Running, opened: Promise<Running | null>) {
    try {
      for await (const message of running.q) {
        handle(message)
      }
    } catch {
      // The stream ending with an error and ending quietly mean the same to the reviewer.
    }
    if (!closed && current === opened) {
      current = null
      events.failed({ kind: "session-dropped" })
    }
  }

  // Resuming is tried once, for the stored session; after a drop the next session is new.
  async function sessionTarget(): Promise<Pick<Options, "resume" | "sessionId">> {
    const id = wantResume
    wantResume = null
    if (id) {
      const lookup = opts.sessionInfo ?? getSessionInfo
      if (await lookup(id, { dir: agentDirectory() }).catch(() => undefined)) {
        return { resume: id }
      }
      events.sessionLost?.()
    }
    const fresh = crypto.randomUUID()
    events.sessionStarted?.(fresh)
    return { sessionId: fresh }
  }

  async function open(): Promise<Running | null> {
    if (claudeExecutable().missing) {
      events.failed({
        kind: "other",
        message: CLAUDE_MISSING,
      })
      return null
    }
    const target = await sessionTarget()
    const inbox = new Inbox()
    const options = { ...sessionOptions(opts, toolset.definitions), ...target }
    return { inbox, q: run({ prompt: inbox, options }) }
  }

  function ensureOpen(): Promise<Running | null> {
    if (current) {
      return current
    }
    const opened = open()
    current = opened
    void opened.then((running) => running && consume(running, opened))
    return opened
  }

  return {
    send(question, position, attachments) {
      toolset.startAnswer()
      interrupted = false
      const text = questionText(question, position, attachments)
      void ensureOpen().then((running) => running?.inbox.push(text))
    },
    interrupt() {
      interrupted = true
      void current?.then((running) => running?.q.interrupt())
    },
    close() {
      closed = true
      void current?.then((running) => {
        running?.inbox.close()
        running?.q.close()
      })
    },
  }
}

export function createClaudeAgent(opts: ClaudeAgentOptions): Agent {
  return {
    model: opts.model,
    start: (events, resumeId) => startSession(opts, events, resumeId ?? null),
  }
}
