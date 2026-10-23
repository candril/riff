/**
 * Handlers for inline reply and inline edit composed inside the
 * thread panel (spec 039). These bypass `$EDITOR` — the user
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
} from "../../state"
import { createComment } from "../../types"
import { saveComment } from "../../storage/comments"
import type { DraftEditorContext } from "../../utils/editor/comment-template"
import { diffHunkAt } from "../../utils/diff-hunk"
import { extractCommentImages } from "../../utils/comment-images"
import { openUrl } from "../../utils/open-url"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { draftOn, type CommentDraftsState } from "./drafts-state"
import type { ToastState } from "../toast/state"
import type { ComposerPickersState } from "./composer-pickers-state"

export interface InlineComposerHandlersContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  /** Current GitHub user, falls back to "@you" when unknown. */
  getCachedCurrentUser: () => string | null
  /** The kept drafts; a saved comment's is forgotten (spec 061). */
  commentDrafts: Pick<CommentDraftsState, "forget">
  composerPickers: Pick<ComposerPickersState, "clear">
}

/** Back to view mode; the pickers go with the composer they were typed in. */
export function cancelComposing(ctx: Pick<InlineComposerHandlersContext, "setState" | "composerPickers">): void {
  ctx.setState(cancelInlineComposer)
  ctx.composerPickers.clear()
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

  // The thread already on this anchor, which a reply joins. A comment is
  // only a reply when it was asked for as one: a line can hold two
  // conversations, and GitHub files them apart (spec 081).
  const thread = state.comments.filter(
    (c) =>
      c.filename === ov.filename &&
      c.line === ov.line &&
      c.side === ov.side
  )

  const comment = createComment(ov.filename, ov.line, body, ov.side, username)
  // Written where GitHub has no anchor — file mode, or context expanded
  // outside every hunk. It is a note: it stays here, and every publish path
  // refuses it rather than losing it to a 422 (spec 085).
  if (ov.note) {
    comment.kind = "note"
    comment.anchorHash = ov.anchorHash
  }
  // Written against a block rather than a line: GitHub is told the range,
  // which is what makes a suggestion replace all of it (spec 076).
  if (ov.startLine && ov.startLine < ov.line) comment.startLine = ov.startLine
  const hunk = diffHunkAt(file.content, ov.line, ov.side)
  if (hunk) comment.diffHunk = hunk
  if (thread.length > 0 && ov.replyToThread) {
    comment.inReplyTo = thread[thread.length - 1]!.id
  }

  ctx.setState((s) => addComment(s, comment))
  ctx.commentDrafts.forget(draftOn(ov))
  cancelComposing(ctx)
  ctx.setState((s) => highlightInlineComment(s, comment.id))
  ctx.render()
  await saveComment(comment, ctx.getState().source)
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
    cancelComposing(ctx)
    ctx.render()
    return null
  }

  const newBody = ov.input
  const trimmed = newBody.trim()

  // Empty edit: drop back to view mode without persisting.
  if (!trimmed) {
    cancelComposing(ctx)
    ctx.render()
    return null
  }

  const currentBody = target.localEdit ?? target.body
  if (newBody === currentBody) {
    cancelComposing(ctx)
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
  ctx.commentDrafts.forget(draftOn(ov))
  cancelComposing(ctx)
  ctx.setState((s) => highlightInlineComment(s, updated.id))
  ctx.toast.show("Comment updated", "success")
  ctx.render()
  await saveComment(updated, ctx.getState().source)
  return updated
}

/**
 * Open every image the comment carries in the browser.
 *
 * The browser is the only viewer that works: riff cannot draw the picture in
 * the panel, and GitHub's attachment URLs are authenticated by browser
 * session, so on a private repo nothing else can even fetch them.
 */
export function openCommentImages(
  ctx: ToastContext,
  comment: Comment
): void {
  const { images } = extractCommentImages(comment.localEdit ?? comment.body)
  if (images.length === 0) {
    toast(ctx, "No images in this comment", "info")
    return
  }

  const opened = images.filter((image) => openUrl(image.url)).length
  if (opened === 0) {
    toast(ctx, "Could not open the image", "error")
    return
  }
  toast(
    ctx,
    opened === 1 ? `Opened ${images[0]!.label}` : `Opened ${opened} images`,
    "success"
  )
}

type ToastContext = Pick<InlineComposerHandlersContext, "toast" | "render">

function toast(
  ctx: ToastContext,
  message: string,
  kind: "info" | "error" | "success"
): void {
  ctx.toast.show(message, kind)
  ctx.render()
  setTimeout(() => {
    ctx.toast.clear()
    ctx.render()
  }, 2500)
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
