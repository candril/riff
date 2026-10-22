/**
 * Submit Review keys. The summary is an OpenTUI textarea owned by the
 * Submit Review island, so typing, paste, arrows, undo and word jumps
 * reach it through OpenTUI's renderable dispatch: what the layers here
 * leave unbound stays unprevented, and the modal still keeps it from the
 * layers behind it.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers, without } from "../../app/key-variants"
import { canSubmit, type ValidatedComment } from "../../components/review-preview-model"
import type { ReviewPreviewState } from "./state"

export interface ReviewPreviewKeyDeps {
  reviewPreview: ReviewPreviewState
  render: () => void
  getValidatedComments: () => ValidatedComment[]
  /** Reviewing one's own PR rules out approving it or requesting changes. */
  isOwnPr: () => boolean
  onConfirmReview: () => void
  /** Read from the textarea, not the factory's `body`: that mirror
   *  is updated asynchronously and can lag the last keystroke. */
  readSummary: () => string
}

export function registerReviewPreviewKeys(riffKeymap: RiffKeymap, deps: ReviewPreviewKeyDeps): () => void {
  const { reviewPreview } = deps
  const captured = riffKeymap.capture(() => reviewPreview.open())
  const update = (action: () => void) => {
    action()
    deps.render()
  }
  const validComments = () => deps.getValidatedComments().filter((c) => c.valid)

  const submit = () => {
    if (reviewPreview.loading()) return
    const excluded = reviewPreview.excludedCommentIds()
    const included = validComments().filter((c) => !excluded.has(c.comment.id)).length
    reviewPreview.setBody(deps.readSummary())
    if (canSubmit(reviewPreview.snapshot(), included, deps.isOwnPr())) deps.onConfirmReview()
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
      command("close", "Close Submit Review", () => update(reviewPreview.close)),
      command("submit", "Submit the review", submit),
      command("section", "Switch between the summary and the comments", () => update(reviewPreview.toggleSection)),
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

  const highlighted = () => validComments()[reviewPreview.highlightedIndex()]
  const move = (delta: number) => {
    const maxIndex = validComments().length - 1
    update(() => reviewPreview.moveHighlight(delta, maxIndex))
  }
  const unregisterComments = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && reviewPreview.focusedSection() === "comments",
    commands: [
      command("comment", "Comment", () => update(() => reviewPreview.setEvent("COMMENT"))),
      command("approve", "Approve", () => update(() => reviewPreview.setEvent("APPROVE"))),
      command("requestChanges", "Request changes", () => update(() => reviewPreview.setEvent("REQUEST_CHANGES"))),
      command("down", "Highlight the next comment", () => move(1)),
      command("up", "Highlight the previous comment", () => move(-1)),
      command("toggle", "Include or leave out the highlighted comment", () => {
        const comment = highlighted()
        if (comment) update(() => reviewPreview.toggleComment(comment.comment.id))
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
