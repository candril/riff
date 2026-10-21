import type { CommentScope } from "../diff-rows/comment-scope"
import type { SplitRows } from "../diff-rows/row-source"
import type { AppState } from "../state"
import type { Agent } from "../providers/agent/agent"
import { readToolset } from "../providers/agent/read-tool-definitions"
import { createRiffSource } from "../providers/agent/riff-source"
import { createClaudeAgent } from "../providers/agent/session"
import { agentFilesOf, agentTargetOf, hiddenFileCount } from "../providers/agent/target"
import { demoAgent } from "../features/chat/demo-agent"
import { createChatState, type ChatState } from "../features/chat/state"
import { chatPositionOf } from "../features/chat/position-of"
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
  return createChatState(reviewAgent(deps), deps.position)
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
