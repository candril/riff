/**
 * Submit Review keys. The summary is an OpenTUI textarea owned by the
 * Submit Review island, so typing, paste, arrows, undo and word jumps
 * reach it through OpenTUI's renderable dispatch: what the layers here
 * leave unbound stays unprevented, and the modal still keeps it from the
 * chain behind it.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import type { AppState } from "../../state"
import { canSubmit, type ValidatedComment } from "../../components/review-preview-model"
import {
  closeReviewPreview,
  moveReviewHighlight,
  setReviewBody,
  setReviewEvent,
  toggleReviewComment,
  toggleReviewSection,
} from "../../state"

export interface ReviewPreviewKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  getValidatedComments: () => ValidatedComment[]
  /** Reviewing one's own PR rules out approving it or requesting changes. */
  isOwnPr: () => boolean
  onConfirmReview: () => void
  /** Read from the textarea, not `state.reviewPreview.body`: that mirror
   *  is updated asynchronously and can lag the last keystroke. */
  readSummary: () => string
}

export function registerReviewPreviewKeys(riffKeymap: RiffKeymap, deps: ReviewPreviewKeyDeps): () => void {
  const captured = riffKeymap.capture(() => deps.getState().reviewPreview.open)
  const update = (updater: (s: AppState) => AppState) => {
    deps.setState(updater)
    deps.render()
  }
  const validComments = () => deps.getValidatedComments().filter((c) => c.valid)

  const submit = () => {
    const before = deps.getState().reviewPreview
    if (before.loading) return
    const included = validComments().filter((c) => !before.excludedCommentIds.has(c.comment.id)).length
    const body = deps.readSummary()
    deps.setState((s) => setReviewBody(s, body))
    if (canSubmit({ ...before, body }, included, deps.isOwnPr())) deps.onConfirmReview()
  }

  const command = (name: string, title: string, run: () => void) => ({
    name: `reviewPreview.${name}`,
    title,
    category: "Submit Review",
    palette: false,
    // Wrapped so no return value gets through: the keymap reads a `false` as unhandled.
    run: () => {
      run()
    },
  })

  const unregisterModal = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      command("close", "Close Submit Review", () => update(closeReviewPreview)),
      command("submit", "Submit the review", submit),
      command("section", "Switch between the summary and the comments", () => update(toggleReviewSection)),
    ],
    bindings: [
      ...anyModifiers("escape", "reviewPreview.close"),
      // Ctrl-s shares its muscle memory with the comment composer. Enter
      // keeps open, pick a type, confirm on the home row; Ctrl-J
      // (`linefeed`) is the summary's newline, which the textarea binds.
      ...anyModifiers("ctrl+s", "reviewPreview.submit"),
      ...without(["ctrl", "meta"], anyModifiers("return", "reviewPreview.submit")),
      ...anyModifiers("tab", "reviewPreview.section"),
    ],
  })

  const highlighted = () => validComments()[deps.getState().reviewPreview.highlightedIndex]
  const move = (delta: number) => {
    const maxIndex = validComments().length - 1
    update((s) => moveReviewHighlight(s, delta, maxIndex))
  }
  const unregisterComments = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && deps.getState().reviewPreview.focusedSection === "comments",
    commands: [
      command("comment", "Comment", () => update((s) => setReviewEvent(s, "COMMENT"))),
      command("approve", "Approve", () => update((s) => setReviewEvent(s, "APPROVE"))),
      command("requestChanges", "Request changes", () => update((s) => setReviewEvent(s, "REQUEST_CHANGES"))),
      command("down", "Highlight the next comment", () => move(1)),
      command("up", "Highlight the previous comment", () => move(-1)),
      command("toggle", "Include or leave out the highlighted comment", () => {
        const comment = highlighted()
        if (comment) update((s) => toggleReviewComment(s, comment.comment.id))
      }),
    ],
    bindings: [
      ...anyModifiers("1", "reviewPreview.comment"),
      ...anyModifiers("2", "reviewPreview.approve"),
      ...anyModifiers("3", "reviewPreview.requestChanges"),
      ...anyModifiers("j", "reviewPreview.down"),
      ...anyModifiers("down", "reviewPreview.down"),
      ...anyModifiers("k", "reviewPreview.up"),
      ...anyModifiers("up", "reviewPreview.up"),
      ...anyModifiers("space", "reviewPreview.toggle"),
    ],
  })

  return () => {
    captured()
    unregisterComments()
    unregisterModal()
  }
}
