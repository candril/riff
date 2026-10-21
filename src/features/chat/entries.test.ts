import { expect, test } from "bun:test"
import type { AgentFailure } from "../../providers/agent/agent"
import { describeFailure } from "./entries"

test.each<[AgentFailure, string]>([
  [{ kind: "not-logged-in" }, "Run `claude login`"],
  [{ kind: "usage-limit" }, "The subscription's usage limit is reached."],
  [{ kind: "usage-limit", resetsAt: "2026-10-12T18:00:00.000Z" }, "resets at"],
  [{ kind: "model-unavailable", model: "claude-x" }, "claude-x is not available"],
  [{ kind: "session-dropped" }, "next question starts a new session"],
  [{ kind: "other", message: "boom" }, "The agent failed: boom"],
])("failure %o says what happened and what to do", (failure, words) => {
  expect(describeFailure(failure)).toContain(words)
})
