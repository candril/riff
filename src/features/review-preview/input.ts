/**
 * Review Preview input handling.
 *
 * The review preview captures all input while the modal is open. The
 * summary input is now an OpenTUI `TextareaRenderable` (singleton in
 * `ReviewSummaryComposer`), so we no longer hand-roll typing, paste,
 * arrow keys, undo/redo, word jumps, etc. — those flow to the focused
 * textarea via OpenTUI's renderable dispatch.
 *
 * What still lives here is the modal-level chrome:
 *  - Esc: close
 *  - Ctrl-s: submit (mirrors the inline-comment composer's convention)
 *  - Tab: toggle focus between the summary input and the comments list
 *  - 1/2/3 (in comments section): pick review type
 *  - j/k/Space (in comments section): navigate / toggle comments
 *
 * In the input section we only intercept the modal-level keys above —
 * everything else falls through to the textarea.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { ValidatedComment } from "../../components"
import { canSubmit } from "../../components"
import { readReviewSummaryValue } from "../../components/ReviewSummaryComposer"
import {
  closeReviewPreview,
  setReviewEvent,
  toggleReviewSection,
  setReviewBody,
  moveReviewHighlight,
  toggleReviewComment,
} from "../../state"

export interface ReviewPreviewInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // Validated comments for navigation
  getValidatedComments: () => ValidatedComment[]
  // Whether reviewing own PR (affects available review types)
  isOwnPr: boolean
  // Called when user confirms review
  onConfirmReview: () => void
}

/**
 * Handle input when review preview is open.
 * Returns true if the key was handled (preview is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: ReviewPreviewInputContext
): boolean {
  if (!ctx.state.reviewPreview.open) {
    return false
  }

  const validatedComments = ctx.getValidatedComments()
  const validComments = validatedComments.filter((c) => c.valid)
  const section = ctx.state.reviewPreview.focusedSection
  const includedCount = validComments.filter(
    (c) => !ctx.state.reviewPreview.excludedCommentIds.has(c.comment.id)
  ).length

  // Esc always closes. preventDefault so a focused textarea doesn't see it.
  if (key.name === "escape") {
    key.preventDefault()
    ctx.setState(closeReviewPreview)
    ctx.render()
    return true
  }

  // Ctrl-s submits from anywhere in the modal. We pull the textarea's
  // live value into state first so the submit handler (which reads
  // `state.reviewPreview.body`) sees what the user actually typed —
  // the onContentChange mirror is asynchronous and may lag the very
  // last keystroke.
  if (key.ctrl && key.name === "s") {
    key.preventDefault()
    if (!ctx.state.reviewPreview.loading) {
      const value = readReviewSummaryValue()
      ctx.setState((s) => setReviewBody(s, value))
      // Re-read the freshly mutated state so canSubmit sees the new body.
      const next = { ...ctx.state, reviewPreview: { ...ctx.state.reviewPreview, body: value } }
      if (canSubmit(next.reviewPreview, includedCount, ctx.isOwnPr)) {
        ctx.onConfirmReview()
      }
    }
    return true
  }

  // Tab toggles between input and comments. preventDefault so the
  // textarea doesn't insert a tab character.
  if (key.name === "tab") {
    key.preventDefault()
    ctx.setState(toggleReviewSection)
    ctx.render()
    return true
  }

  // Comments section: navigation + type selector + space toggle.
  if (section === "comments") {
    if (key.name === "1") {
      ctx.setState((s) => setReviewEvent(s, "COMMENT"))
      ctx.render()
      return true
    }
    if (key.name === "2") {
      ctx.setState((s) => setReviewEvent(s, "APPROVE"))
      ctx.render()
      return true
    }
    if (key.name === "3") {
      ctx.setState((s) => setReviewEvent(s, "REQUEST_CHANGES"))
      ctx.render()
      return true
    }
    if (key.name === "j" || key.name === "down") {
      ctx.setState((s) => moveReviewHighlight(s, 1, validComments.length - 1))
      ctx.render()
      return true
    }
    if (key.name === "k" || key.name === "up") {
      ctx.setState((s) => moveReviewHighlight(s, -1, validComments.length - 1))
      ctx.render()
      return true
    }
    if (key.name === "space") {
      const highlightedComment = validComments[ctx.state.reviewPreview.highlightedIndex]
      if (highlightedComment) {
        ctx.setState((s) => toggleReviewComment(s, highlightedComment.comment.id))
        ctx.render()
      }
      return true
    }
    // Comments section is modal — swallow everything else.
    return true
  }

  // Input section: everything not caught above (Esc / Ctrl-s / Tab)
  // flows to the focused TextareaRenderable. Returning true here
  // short-circuits our outer handler chain (so global keys don't
  // fire) while leaving `preventDefault` unset so the textarea still
  // sees the event.
  return true
}
