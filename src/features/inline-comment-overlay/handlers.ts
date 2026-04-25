/**
 * Handlers for inline reply and inline edit composed inside the
 * `InlineCommentOverlay` (spec 039). These bypass `$EDITOR` — the user
 * types the body inside the overlay and `Ctrl-s` flushes the draft to
 * local state + disk. The capital-letter actions (`R`, `E`) keep the
 * old `$EDITOR` flow via `commentsFeature.handleAddComment`.
 */

import type { AppState } from "../../state"
import type { Comment } from "../../types"
import {
  addComment,
  cancelInlineComposer,
  showToast,
} from "../../state"
import { createComment } from "../../types"
import { saveComment } from "../../storage"
import { extractDiffHunk } from "../../utils/editor"

export interface InlineComposerHandlersContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  source: string
  /** Current GitHub user, falls back to "@you" when unknown. */
  getCachedCurrentUser: () => string | null
}

/**
 * Submit the in-progress draft as a new comment / reply at the
 * overlay's anchor. Empty drafts are no-ops. The overlay drops back
 * to view mode on success.
 */
export async function submitInlineDraft(
  ctx: InlineComposerHandlersContext
): Promise<void> {
  const state = ctx.getState()
  const ov = state.inlineCommentOverlay
  if (!ov.open || ov.mode !== "compose") return

  const body = ov.input.trim()
  if (!body) return

  const file = state.files.find((f) => f.filename === ov.filename)
  if (!file) return

  const username =
    (state.appMode === "pr" && ctx.getCachedCurrentUser()) || "@you"

  // Find existing thread on this anchor — if there is one, the new
  // comment becomes a reply to its tail.
  const thread = state.comments.filter(
    (c) =>
      c.filename === ov.filename &&
      c.line === ov.line &&
      c.side === ov.side
  )

  const comment = createComment(ov.filename, ov.line, body, ov.side, username)
  comment.diffHunk = extractDiffHunk(file.content, ov.line)
  if (thread.length > 0) {
    comment.inReplyTo = thread[thread.length - 1]!.id
  }

  ctx.setState((s) => addComment(s, comment))
  ctx.setState(cancelInlineComposer)
  ctx.render()
  await saveComment(comment, ctx.source)
}

/**
 * Apply the in-progress edit draft to the comment being edited.
 * For local/pending comments the body is rewritten in place. For
 * synced comments the change is staged in `localEdit` (user presses
 * `S` to push the edit to GitHub). Empty drafts cancel the edit.
 */
export async function submitInlineEditDraft(
  ctx: InlineComposerHandlersContext
): Promise<void> {
  const state = ctx.getState()
  const ov = state.inlineCommentOverlay
  if (!ov.open || ov.mode !== "edit" || !ov.editingId) return

  const target = state.comments.find((c) => c.id === ov.editingId)
  if (!target) {
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return
  }

  const newBody = ov.input
  const trimmed = newBody.trim()

  // Empty edit: drop back to view mode without persisting.
  if (!trimmed) {
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return
  }

  const currentBody = target.localEdit ?? target.body
  if (newBody === currentBody) {
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return
  }

  let updated: Comment
  if (target.status === "synced") {
    // Stage edit; clear if it matches the original body again.
    updated =
      newBody === target.body
        ? { ...target, localEdit: undefined }
        : { ...target, localEdit: newBody }
  } else {
    updated = { ...target, body: newBody }
  }

  ctx.setState((s) => ({
    ...s,
    comments: s.comments.map((c) => (c.id === target.id ? updated : c)),
  }))
  ctx.setState(cancelInlineComposer)
  ctx.setState((s) => showToast(s, "Comment updated", "success"))
  ctx.render()
  await saveComment(updated, ctx.source)
}
