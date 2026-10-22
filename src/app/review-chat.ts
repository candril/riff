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
import {
  checkClaudeVersion,
  claudeVersionOutput,
  pinnedClaudeVersion,
  type ClaudeVersionNote,
} from "../providers/agent/claude-version"
import { claudeExecutable } from "../providers/agent/environment"
import { agentFilesOf, agentTargetOf, hiddenFileCount } from "../providers/agent/target"
import { demoAgent } from "../features/chat/demo-agent"
import { createChatState, type ChatState } from "../features/chat/state"
import { chatPositionOf } from "../features/chat/position-of"
import { expandReferences, type Expanded } from "../features/chat/references"
import { threadAttachment, threadsAt } from "../features/chat/position-threads"
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
  /** Defaults to asking the installed claude; tests hand in their own. */
  claudeVersion?: () => Promise<ClaudeVersionNote | null>
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

/**
 * One conversation per app; its session opens on the first question. The one thing spawned
 * up front is `claude --version`, unawaited, so a drifted claude is already said in the chat
 * when the reviewer first opens it rather than as a failure on the first question.
 */
export function createReviewChat(deps: ReviewChatDeps): ChatState {
  const chat = createChatState(reviewAgent(deps), deps.position, reviewReferences(deps.getState))
  if (!deps.demo) {
    void (deps.claudeVersion ?? installedClaudeVersion)()
      .then((note) => note && chat.note(note.text, note.tone))
      .catch(() => {})
  }
  return chat
}

// Only a compiled riff has a pin, and only a compiled riff runs the user's own claude.
function installedClaudeVersion(): Promise<ClaudeVersionNote | null> {
  if (pinnedClaudeVersion === undefined) return Promise.resolve(null)
  return checkClaudeVersion({ executable: claudeExecutable(), pinned: pinnedClaudeVersion, run: claudeVersionOutput })
}

/** A question's `@` tokens and the threads at its position, read against the review as it stands when the question is sent. */
export function reviewReferences(getState: () => AppState) {
  return (text: string, position: Position | null): Expanded => {
    const state = getState()
    const pr = state.prInfo
    const expanded = expandReferences(text, {
      files: state.files,
      position,
      pr: pr && { number: pr.number, title: pr.title, description: pr.body, files: agentFilesOf(state) },
    })
    const threads = position && "attachments" in expanded && threadAttachment(threadsAt(position, state.comments))
    if (!threads) return expanded
    // First, as they belong to the position the agent reads just before them.
    return {
      attachments: [threads.attachment, ...expanded.attachments],
      labels: [threads.label, ...expanded.labels],
    }
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
