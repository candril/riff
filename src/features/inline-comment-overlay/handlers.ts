/**
 * Handlers for inline reply and inline edit composed inside the
 * `InlineCommentOverlay` (spec 039). These bypass `$EDITOR` — the user
 * types the body inside the overlay and `Enter` / `Ctrl-s` flushes the
 * draft to local state + disk (`Ctrl-p` also pushes it to GitHub). The capital-letter actions (`R`, `E`) keep the
 * old `$EDITOR` flow via `commentsFeature.handleAddComment`.
 */

import type { AppState } from "../../state"
import type { Comment } from "../../types"
import {
  addComment,
  cancelInlineComposer,
  highlightInlineComment,
  showToast,
} from "../../state"
import { createComment } from "../../types"
import { saveComment } from "../../storage"
import { extractDiffHunk, type DraftEditorContext } from "../../utils/editor"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"

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
 *
 * Returns the saved comment so a caller that wants to publish it in the
 * same keystroke doesn't have to go hunting for it in state.
 */
export async function submitInlineDraft(
  ctx: InlineComposerHandlersContext
): Promise<Comment | null> {
  const state = ctx.getState()
  const ov = state.inlineCommentOverlay
  if (!ov.open || ov.mode !== "compose") return null

  const body = ov.input.trim()
  if (!body) return null

  const file = state.files.find((f) => f.filename === ov.filename)
  if (!file) return null

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
  ctx.setState((s) => highlightInlineComment(s, comment.id))
  ctx.render()
  await saveComment(comment, ctx.source)
  return comment
}

/**
 * Apply the in-progress edit draft to the comment being edited.
 * For local/pending comments the body is rewritten in place. For
 * synced comments the change is staged in `localEdit` (user presses
 * `S` to push the edit to GitHub). Empty drafts cancel the edit.
 */
export async function submitInlineEditDraft(
  ctx: InlineComposerHandlersContext
): Promise<Comment | null> {
  const state = ctx.getState()
  const ov = state.inlineCommentOverlay
  if (!ov.open || ov.mode !== "edit" || !ov.editingId) return null

  const target = state.comments.find((c) => c.id === ov.editingId)
  if (!target) {
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return null
  }

  const newBody = ov.input
  const trimmed = newBody.trim()

  // Empty edit: drop back to view mode without persisting.
  if (!trimmed) {
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return null
  }

  const currentBody = target.localEdit ?? target.body
  if (newBody === currentBody) {
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return null
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
  ctx.setState((s) => highlightInlineComment(s, updated.id))
  ctx.setState((s) => showToast(s, "Comment updated", "success"))
  ctx.render()
  await saveComment(updated, ctx.source)
  return updated
}

/** Diff rows shown either side of the anchor in the Ctrl-g buffer. */
const DRAFT_CONTEXT_RADIUS = 6

/**
 * Collect what riff knows about the composer's anchor so the Ctrl-g
 * hand-off to $EDITOR carries the same thread and diff as the `C`
 * route. Returns undefined when there is no anchor to describe (the
 * panel opened file-scoped, with line 0) — the editor then just gets
 * the bare draft.
 */
export function buildComposerEditorContext(
  state: AppState,
  lineMapping: DiffLineMapping,
  username: string
): DraftEditorContext | undefined {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return undefined

  // In edit mode the panel's anchor is wherever it was opened, not
  // necessarily where the edited comment lives — the comment wins.
  const editing = ov.editingId
    ? state.comments.find((c) => c.id === ov.editingId) ?? null
    : null
  const filename = editing?.filename ?? ov.filename
  const line = editing?.line ?? ov.line
  const side = editing?.side ?? ov.side
  if (!filename || line <= 0) return undefined

  const thread = state.comments.filter(
    (c) =>
      c.filename === filename &&
      c.line === line &&
      c.side === side &&
      c.id !== editing?.id
  )

  const visualLine = lineMapping.findLineForComment({ filename, line, side })
  const anchorRow = visualLine !== null ? lineMapping.getLine(visualLine) : undefined

  // An outdated comment's anchor is gone from the current diff; the hunk
  // captured when it was written is the only context left.
  const contextHunk =
    visualLine !== null
      ? extractVisualContext(lineMapping, visualLine, DRAFT_CONTEXT_RADIUS)
      : editing?.diffHunk ?? thread[0]?.diffHunk

  const file = state.files.find((f) => f.filename === filename)

  return {
    filePath: filename,
    line,
    side,
    thread,
    username,
    contextHunk,
    fullDiff: file?.content,
    anchorLine: anchorRow?.rawLine || anchorRow?.content,
    changeStatus: file?.status,
  }
}

/**
 * Pull the raw diff rows around a visual line, dropping the chrome rows
 * (file headers, dividers, spacers) that only exist on screen.
 */
function extractVisualContext(
  lineMapping: DiffLineMapping,
  visualLine: number,
  radius: number
): string {
  const out: string[] = []
  const lo = Math.max(0, visualLine - radius)
  const hi = Math.min(lineMapping.lineCount - 1, visualLine + radius)
  for (let i = lo; i <= hi; i++) {
    const l = lineMapping.getLine(i)
    if (!l) continue
    if (l.type === "file-header" || l.type === "divider" || l.type === "spacing") continue
    out.push(l.rawLine || l.content)
  }
  return out.join("\n")
}
