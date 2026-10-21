import type { AppState } from "../state"
import type { Agent } from "../providers/agent/agent"
import { readToolset } from "../providers/agent/read-tool-definitions"
import { createRiffSource } from "../providers/agent/riff-source"
import { createClaudeAgent } from "../providers/agent/session"
import { agentFilesOf, agentTargetOf, hiddenFileCount } from "../providers/agent/target"
import { demoAgent } from "../features/chat/demo-agent"
import { createChatState, type ChatState } from "../features/chat/state"

export const CHAT_MODEL = "claude-opus-5-5"

export interface ReviewChatDeps {
  demo: boolean
  getState: () => AppState
  target: string | undefined
  headSha: () => string | null
}

/** The agent for this review: Claude on the subscription, or a canned one for `--demo`, which promises no network. */
export function reviewAgent(deps: ReviewChatDeps): Agent {
  if (deps.demo) return demoAgent()
  return createClaudeAgent({
    model: CHAT_MODEL,
    context: () => {
      const state = deps.getState()
      return { target: agentTargetOf(state), files: agentFilesOf(state), hidden: hiddenFileCount(state) }
    },
    tools: (events) =>
      readToolset(createRiffSource({ state: deps.getState, target: deps.target, headSha: deps.headSha }), events),
  })
}

/** One conversation per app; its session opens on the first question, so building it spawns nothing. */
export function createReviewChat(deps: ReviewChatDeps): ChatState {
  return createChatState(reviewAgent(deps))
}
