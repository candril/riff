import { proposalAnchor, type ProposalAnchor } from "../features/chat/proposal-anchor"
import type { ComposerOutcome } from "../features/inline-comment-overlay/composer-keys"
import type { CommentProposal, Proposer } from "../providers/agent/proposer"
import { isUnsynced } from "../providers/agent/thread-text"
import type { AppState } from "../state"
import type { CommentDraftsState } from "../features/inline-comment-overlay/drafts-state"
import { editTarget, newCommentTarget, type ProposalTarget } from "./proposal-targets"

export const BUSY = "A proposal is already open; propose the next after the reviewer closes it."
export const ENDED = "The conversation ended before the reviewer decided."
export const DROPPED = "The reviewer dropped it; nothing was saved."

export interface ProposalDeps {
  getState(): AppState
  setState(update: (state: AppState) => AppState): void
  render(): void
  /** Puts the diff cursor on the line, switching to or expanding its file. */
  reveal(anchor: ProposalAnchor): void
  /** Puts the text in the composer the render just showed, with the cursor at its end: the render
   *  seeds it with the cursor at the start, and the reviewer goes on from the end. */
  fillComposer(text: string): void
  /** Says in the chat what riff did with a proposal. */
  note(text: string): void
  /** The reviewer's kept drafts, which a proposal never opens over (spec 061). */
  commentDrafts: Pick<CommentDraftsState, "on" | "forget">
}

interface Pending {
  target: ProposalTarget
  text: string
  // False while it waits for a composer the reviewer has open.
  opened: boolean
  answer(outcome: string): void
}

const composerBusy = (state: AppState) =>
  state.inlineCommentOverlay.open && state.inlineCommentOverlay.mode !== "view"

/**
 * The agent's proposals (spec 102), opened in the thread panel's own composer so that what the
 * reviewer keeps is stored, anchored and published exactly like a comment they wrote. One at a
 * time; each tool call is answered once, with what the reviewer did.
 */
export function createProposals(deps: ProposalDeps): Proposer & {
  composerSettled(outcome: ComposerOutcome): void
  afterRender(): void
  check(): void
  endConversation(): void
} {
  let current: Pending | null = null
  let checkQueued = false

  function settle(outcome: string) {
    const done = current
    current = null
    done?.answer(outcome)
  }

  function draftRefusal(target: ProposalTarget): string | null {
    if (!deps.commentDrafts.on(target.draftOn)) return null
    const what = "editingId" in target.draftOn ? "an unsaved edit of the comment" : "an unsaved draft"
    return `The reviewer has ${what} on ${target.place}; it stays theirs, so nothing opened there.`
  }

  function open(pending: Pending) {
    const refusal = draftRefusal(pending.target)
    if (refusal) return settle(refusal)
    pending.opened = true
    // The composer belongs to a line of the diff, so the diff is what the reviewer sees it over.
    deps.setState((s) => (s.viewMode === "diff" ? s : { ...s, viewMode: "diff", previousView: s.viewMode }))
    deps.reveal(pending.target.anchor)
    deps.setState((s) => pending.target.open(s, pending.text))
    deps.note(pending.target.opened)
    deps.render()
    deps.fillComposer(pending.text)
  }

  function drop(pending: Pending) {
    // Untouched, the remembered draft is the agent's text, not something the reviewer half wrote,
    // and it would turn away the next proposal on the same place.
    if (deps.commentDrafts.on(pending.target.draftOn) === pending.text) {
      deps.commentDrafts.forget(pending.target.draftOn)
    }
    settle(DROPPED)
  }

  function check() {
    const pending = current
    if (!pending) return
    const state = deps.getState()
    if (!pending.opened) {
      if (!composerBusy(state)) open(pending)
    } else if (!pending.target.composing(state)) {
      drop(pending)
    }
  }

  function propose(target: ProposalTarget, text: string): Promise<string> {
    if (current) return Promise.resolve(BUSY)
    const refusal = draftRefusal(target)
    if (refusal) return Promise.resolve(refusal)
    return new Promise((answer) => {
      const pending: Pending = { target, text, opened: false, answer }
      current = pending
      if (composerBusy(deps.getState())) {
        deps.note(
          `The agent's proposal on ${target.place} waits until the comment open in the thread panel is saved or dropped.`,
        )
      } else {
        open(pending)
      }
    })
  }

  return {
    proposeComment(proposal: CommentProposal) {
      const state = deps.getState()
      const anchor = proposalAnchor(state.files, state.ignoredFiles, proposal)
      return typeof anchor === "string" ? Promise.resolve(anchor) : propose(newCommentTarget(anchor), proposal.text)
    },
    proposeEdit(id: string, text: string) {
      const comment = deps.getState().comments.find((c) => c.id === id)
      if (!comment) return Promise.resolve(`No comment ${id}; list_comments lists them.`)
      if (!isUnsynced(comment)) {
        return Promise.resolve(
          `Comment ${id} is on GitHub as written, not one of the reviewer's own comments; list_comments lists those.`,
        )
      }
      return propose(editTarget(comment), text)
    },
    composerSettled(outcome) {
      const pending = current
      if (!pending?.opened) return
      // Still composing: Enter on an empty composer saves nothing.
      if (pending.target.composing(deps.getState())) return
      const kept = outcome === "dropped" ? null : pending.target.outcome(deps.getState(), outcome)
      if (kept) settle(kept)
      else drop(pending)
    },
    // Deferred, so the composer's own report of a key comes first; this catches every other way
    // the composer closes, and opens a waiting proposal once the reviewer's comment is done.
    afterRender() {
      if (!current || checkQueued) return
      checkQueued = true
      queueMicrotask(() => {
        checkQueued = false
        check()
      })
    },
    check,
    // The composer stays as it is: what is in it is the reviewer's now.
    endConversation: () => settle(ENDED),
  }
}

export type Proposals = ReturnType<typeof createProposals>
