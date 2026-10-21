import { anchorPlace, proposalAnchor, type ProposalAnchor } from "../features/chat/proposal-anchor"
import type { ComposerOutcome } from "../features/inline-comment-overlay"
import type { CommentProposal, Proposer } from "../providers/agent/proposer"
import {
  commentDraftFor,
  forgetCommentDraftOn,
  openInlineCommentOverlay,
  setInlineCommentInput,
  type AppState,
} from "../state"

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
}

interface Pending {
  anchor: ProposalAnchor
  text: string
  // False while it waits for a composer the reviewer has open.
  opened: boolean
  // The comments there were when it opened: the one it saves as is the one not among them.
  known: ReadonlySet<string>
  answer(outcome: string): void
}

const composerBusy = (state: AppState) =>
  state.inlineCommentOverlay.open && state.inlineCommentOverlay.mode !== "view"

function composingOn(state: AppState, anchor: ProposalAnchor): boolean {
  const ov = state.inlineCommentOverlay
  return (
    ov.open &&
    ov.mode === "compose" &&
    ov.filename === anchor.filename &&
    ov.line === anchor.line &&
    ov.side === anchor.side
  )
}

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

  function draftRefusal(anchor: ProposalAnchor): string | null {
    const { filename, line, side } = anchor
    return commentDraftFor(deps.getState(), filename, line, side)
      ? `The reviewer has an unsaved draft on ${anchorPlace(anchor)}; it stays theirs, so nothing opened there.`
      : null
  }

  function open(pending: Pending) {
    const refusal = draftRefusal(pending.anchor)
    if (refusal) return settle(refusal)
    const { filename, line, side, startLine } = pending.anchor
    pending.opened = true
    pending.known = new Set(deps.getState().comments.map((c) => c.id))
    // The composer belongs to a line of the diff, so the diff is what the reviewer sees it over.
    deps.setState((s) => (s.viewMode === "diff" ? s : { ...s, viewMode: "diff", previousView: s.viewMode }))
    deps.reveal(pending.anchor)
    deps.setState((s) =>
      setInlineCommentInput(openInlineCommentOverlay(s, filename, line, side, "compose", startLine), pending.text),
    )
    deps.note(`Proposed a comment on ${anchorPlace(pending.anchor)} — it is open in the thread panel.`)
    deps.render()
    deps.fillComposer(pending.text)
  }

  function drop(pending: Pending) {
    // Untouched, the remembered draft is the agent's text, not a comment the reviewer half wrote,
    // and it would turn away the next proposal on this line.
    const { filename, line, side } = pending.anchor
    if (commentDraftFor(deps.getState(), filename, line, side) === pending.text) {
      deps.setState((s) => forgetCommentDraftOn(s, pending.anchor))
    }
    settle(DROPPED)
  }

  function savedOutcome(pending: Pending, outcome: ComposerOutcome): string | null {
    const { filename, line, side } = pending.anchor
    const saved = deps
      .getState()
      .comments.find((c) => !pending.known.has(c.id) && c.filename === filename && c.line === line && c.side === side)
    if (!saved) return null
    return outcome === "published"
      ? `The reviewer saved it and published it to GitHub: ${saved.body}`
      : `The reviewer saved it as a local comment on ${anchorPlace(pending.anchor)}: ${saved.body}`
  }

  function check() {
    const pending = current
    if (!pending) return
    const state = deps.getState()
    if (!pending.opened) {
      if (!composerBusy(state)) open(pending)
    } else if (!composingOn(state, pending.anchor)) {
      drop(pending)
    }
  }

  return {
    proposeComment(proposal: CommentProposal): Promise<string> {
      const state = deps.getState()
      const anchor = proposalAnchor(state.files, state.ignoredFiles, proposal)
      if (typeof anchor === "string") return Promise.resolve(anchor)
      if (current) return Promise.resolve(BUSY)
      const refusal = draftRefusal(anchor)
      if (refusal) return Promise.resolve(refusal)
      return new Promise((answer) => {
        const pending: Pending = { anchor, text: proposal.text, opened: false, known: new Set(), answer }
        current = pending
        if (composerBusy(state)) {
          deps.note(
            `The comment proposed on ${anchorPlace(anchor)} waits until the comment open in the thread panel is saved or dropped.`,
          )
        } else {
          open(pending)
        }
      })
    },
    composerSettled(outcome) {
      const pending = current
      if (!pending?.opened) return
      // Still composing: Enter on an empty composer saves nothing.
      if (composingOn(deps.getState(), pending.anchor)) return
      if (outcome === "dropped") return drop(pending)
      const saved = savedOutcome(pending, outcome)
      if (saved) settle(saved)
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
