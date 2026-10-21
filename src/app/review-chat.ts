import type { CommentScope } from "../diff-rows/comment-scope"
import type { SplitRows } from "../diff-rows/row-source"
import type { AppState } from "../state"
import type { Agent, AgentEvents } from "../providers/agent/agent"
import { readToolset } from "../providers/agent/read-tool-definitions"
import { proposeToolDefinitions } from "../providers/agent/propose-tool-definitions"
import type { Proposer } from "../providers/agent/proposer"
import type { ReviewSource } from "../providers/agent/review-source"
import type { AgentToolset } from "../providers/agent/tool-server"
import { createRiffSource } from "../providers/agent/riff-source"
import { createClaudeAgent } from "../providers/agent/session"
import { agentFilesOf, agentTargetOf, hiddenFileCount } from "../providers/agent/target"
import { demoAgent } from "../features/chat/demo-agent"
import { createChatState, type ChatState } from "../features/chat/state"
import { chatPositionOf } from "../features/chat/position-of"
import { expandReferences, type Expanded } from "../features/chat/references"
import type { Position } from "../providers/agent/position"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { VimCursorState } from "../vim-diff/types"

export const CHAT_MODEL = "claude-opus-5-5"

export interface ReviewChatDeps {
  demo: boolean
  getState: () => AppState
  target: string | undefined
  headSha: () => string | null
  /** Read once per question, as it is sent. */
  position: () => Position | null
  /** Asked for when a session opens: app.ts builds the chat before the diff the proposals move. */
  proposer: () => Proposer
}

/** What the agent can call: the read tools, budgeted per answer, and the proposals, which are not. */
export function reviewToolset(
  source: ReviewSource,
  proposer: Proposer,
  events: Pick<AgentEvents, "readFailed">,
): AgentToolset {
  const reads = readToolset(source, events)
  return { definitions: [...reads.definitions, ...proposeToolDefinitions(proposer)], startAnswer: reads.startAnswer }
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
      reviewToolset(
        createRiffSource({ state: deps.getState, target: deps.target, headSha: deps.headSha }),
        deps.proposer(),
        events,
      ),
  })
}

/** One conversation per app; its session opens on the first question, so building it spawns nothing. */
export function createReviewChat(deps: ReviewChatDeps): ChatState {
  return createChatState(reviewAgent(deps), deps.position, reviewReferences(deps.getState))
}

/** A question's `@` tokens, read against the review as it stands when the question is sent. */
export function reviewReferences(getState: () => AppState) {
  return (text: string, position: Position | null): Expanded => {
    const state = getState()
    const pr = state.prInfo
    return expandReferences(text, {
      files: state.files,
      position,
      pr: pr && { number: pr.number, title: pr.title, description: pr.body, files: agentFilesOf(state) },
    })
  }
}

export interface DiffCursorDeps {
  getState: () => AppState
  getVimState: () => VimCursorState
  getMapping: () => DiffLineMapping
  getScope: () => CommentScope
  /** The split rows the scope is read from, so an empty half can find its nearest line; null in unified. */
  getRows: () => SplitRows | null
}

/** Only the diff has a cursor in the change; a question asked over the overview, the feed or the PR info carries none. */
export function diffCursorPosition(deps: DiffCursorDeps): () => Position | null {
  return () => {
    const state = deps.getState()
    if (state.viewMode !== "diff") return null
    return chatPositionOf({
      mapping: deps.getMapping(),
      vim: deps.getVimState(),
      scope: deps.getScope(),
      rows: deps.getRows(),
      files: state.files,
    })
  }
}
