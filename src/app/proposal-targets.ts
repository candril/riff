import { anchorPlace, type ProposalAnchor } from "../features/chat/proposal-anchor"
import type { ComposerOutcome } from "../features/inline-comment-overlay/composer-keys"
import {
  expandThreadFor,
  highlightInlineComment,
  openInlineCommentOverlay,
  setInlineCommentInput,
  startInlineEdit,
  type AppState,
} from "../state"
import type { DraftOn } from "../features/inline-comment-overlay/drafts-state"
import type { Comment } from "../types"

/** Where a proposal opens in the composer, and how to read what the reviewer did there. */
export interface ProposalTarget {
  anchor: ProposalAnchor
  place: string
  /** The draft Esc remembers for it. */
  draftOn: DraftOn
  /** The composer is still open on it. */
  composing(state: AppState): boolean
  open(state: AppState, text: string): AppState
  opened: string
  /** What the reviewer kept, or null when nothing was saved. */
  outcome(state: AppState, outcome: Exclude<ComposerOutcome, "dropped">): string | null
}

export function newCommentTarget(anchor: ProposalAnchor): ProposalTarget {
  const { filename, line, side, startLine } = anchor
  const place = anchorPlace(anchor)
  // The comments there were when it opened: the one it saves as is the one not among them.
  let known: ReadonlySet<string> = new Set()
  return {
    anchor,
    place,
    draftOn: { filename, line, side },
    composing(state) {
      const ov = state.inlineCommentOverlay
      return ov.open && ov.mode === "compose" && ov.filename === filename && ov.line === line && ov.side === side
    },
    open(state, text) {
      known = new Set(state.comments.map((c) => c.id))
      return setInlineCommentInput(openInlineCommentOverlay(state, filename, line, side, "compose", startLine), text)
    },
    opened: `Proposed a comment on ${place} — it is open in the thread panel.`,
    outcome(state, outcome) {
      const saved = state.comments.find(
        (c) => !known.has(c.id) && c.filename === filename && c.line === line && c.side === side,
      )
      if (!saved) return null
      return outcome === "published"
        ? `The reviewer saved it and published it to GitHub: ${saved.body}`
        : `The reviewer saved it as a local comment on ${place}: ${saved.body}`
    },
  }
}

const textOf = (comment: Comment) => comment.localEdit ?? comment.body

export function editTarget(comment: Comment): ProposalTarget {
  const { id, filename, line, side, startLine } = comment
  const anchor: ProposalAnchor = { filename, line, side, ...(startLine ? { startLine } : {}) }
  const place = anchorPlace(anchor)
  let before = textOf(comment)
  return {
    anchor,
    place,
    draftOn: { editingId: id },
    composing(state) {
      const ov = state.inlineCommentOverlay
      return ov.open && ov.mode === "edit" && ov.editingId === id
    },
    open(state, text) {
      before = textOf(state.comments.find((c) => c.id === id) ?? comment)
      const shown = expandThreadFor(openInlineCommentOverlay(state, filename, line, side, "view"), id)
      return startInlineEdit(highlightInlineComment(shown, id), id, text)
    },
    opened: `Proposed new wording for your comment on ${place} — it is open in the thread panel.`,
    outcome(state, outcome) {
      const now = state.comments.find((c) => c.id === id)
      if (!now) return null
      const after = textOf(now)
      if (after === before) return "The reviewer kept the comment as it was."
      if (outcome === "published") return `The reviewer saved the new wording and published it to GitHub: ${after}`
      // A synced comment's edit is staged beside GitHub's copy until the reviewer pushes it.
      const staged = now.status === "synced" ? ", staged; it reaches GitHub when they push it" : ""
      return `The reviewer saved the new wording on ${place}${staged}: ${after}`
    },
  }
}
