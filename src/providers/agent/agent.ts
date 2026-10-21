import type { Position } from "./position"

export type AgentFailure =
  | { kind: "not-logged-in" }
  | { kind: "usage-limit"; resetsAt?: string }
  | { kind: "model-unavailable"; model: string }
  | { kind: "session-dropped" }
  | { kind: "other"; message: string }

export interface Usage {
  input: number
  output: number
}

export interface AgentEvents {
  // A session id the agent can resume later; a fresh one replaces any earlier.
  sessionStarted?(id: string): void
  // A resume was asked for and the agent no longer has that session.
  sessionLost?(): void
  text(chunk: string): void
  readFailed(description: string): void
  answerDone(result: { interrupted: boolean; usage?: Usage }): void
  failed(failure: AgentFailure): void
}

export interface AgentSession {
  // Attachments are what the question's @ tokens expanded to; the question keeps the tokens as typed.
  send(question: string, position: Position | null, attachments: readonly string[]): void
  interrupt(): void
  close(): void
}

export interface Agent {
  readonly model: string
  start(events: AgentEvents, resumeId?: string | null): AgentSession
}
