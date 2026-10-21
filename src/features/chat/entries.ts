import type { AgentFailure } from "../../providers/agent/agent"
import type { Position } from "../../providers/agent/position"

export type Entry =
  | {
      kind: "question"
      text: string
      waiting: boolean
      // Taken when the question was asked; the chat shows its label so the reviewer sees what went.
      position: Position | null
      // The question's @ tokens, expanded when it was asked: the agent gets the attachments, the chat shows the labels.
      attachments: string[]
      labels: string[]
    }
  | { kind: "answer"; text: string; streaming: boolean; interrupted: boolean }
  | { kind: "note"; text: string; tone: "error" | "info" }

export function describeFailure(failure: AgentFailure): string {
  switch (failure.kind) {
    case "not-logged-in":
      return "Not logged in to Claude. Run `claude login`, then ask again."
    case "usage-limit":
      return failure.resetsAt
        ? `The subscription's usage limit is reached; it resets at ${new Date(failure.resetsAt).toLocaleString()}.`
        : "The subscription's usage limit is reached."
    case "model-unavailable":
      return `The model ${failure.model} is not available on this subscription.`
    case "session-dropped":
      return "The agent session dropped. The next question starts a new session with the review in context."
    case "other":
      return `The agent failed: ${failure.message}`
  }
}
