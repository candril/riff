/**
 * Comment handlers (add, edit, submit)
 *
 * Handles creating and submitting comments in both local and PR mode.
 */

import type { AppState } from "../../state"
import type { Comment, FileReviewStatus } from "../../types"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { ValidatedComment } from "../../components"
import type { PrInfo, SubmitResult } from "../../providers/github"
import {
  addComment,
  deleteComment,
  showToast,
  clearToast,
  getVisibleComments,
  showConfirmDialog,
  closeConfirmDialog,
} from "../../state"
import { createComment } from "../../types"
import { saveComment, deleteCommentFile } from "../../storage"
import {
  openCommentEditor,
  extractDiffHunk,
  parseEditorOutput,
} from "../../utils/editor"
import { exitVisualMode, getSelectionRange } from "../../vim-diff/cursor-state"
import { flattenThreadsForNav, groupIntoThreads } from "../../utils/threads"
import {
  getCurrentUser,
  getPrHeadSha,
  submitSingleComment,
  submitReply,
  updateComment,
  deleteGitHubComment,
} from "../../providers/github"

export interface CommentsContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  // Line mapping
  getLineMapping: () => DiffLineMapping
  // Render
  render: () => void
  // Renderer control
  suspendRenderer: () => void
  resumeRenderer: () => void
  // Mode and PR info
  source: string
  mode: "local" | "pr"
  prInfo: PrInfo | null
  // Cached current user (for faster comment creation)
  getCachedCurrentUser: () => string | null
  setCachedCurrentUser: (user: string) => void
}

/**
 * Validate comments for GitHub submission.
 * Checks if the comment's file/line exists in the current diff.
 */
export function validateCommentsForSubmit(
  comments: Comment[],
  files: AppState["files"]
): ValidatedComment[] {
  return comments.map((comment) => {
    // Check if file exists in the diff
    const file = files.find((f) => f.filename === comment.filename)
    if (!file) {
      return { comment, valid: false, reason: "file not in diff" }
    }

    // For now, if the file exists and we have a line number, assume valid
    // (The line was validated when the comment was created via isCommentable)
    // TODO: Could add more granular validation by checking if line is in a hunk
    return { comment, valid: true }
  })
}

/**
 * Save a comment to disk
 */
export async function persistComment(comment: Comment, source: string): Promise<void> {
  await saveComment(comment, source)
}

/**
 * Handle adding a comment on current line or selection
 */
export async function handleAddComment(ctx: CommentsContext): Promise<void> {
  const state = ctx.getState()
  if (state.files.length === 0) return

  const vimState = ctx.getVimState()
  const lineMapping = ctx.getLineMapping()

  let startLine: number
  let endLine: number

  // Check if in visual line mode
  const selectionRange = getSelectionRange(vimState)
  if (selectionRange) {
    ;[startLine, endLine] = selectionRange
  } else {
    startLine = endLine = vimState.line
  }

  // Find the first commentable line in the range
  let anchor = lineMapping.getCommentAnchor(startLine)
  for (let i = startLine; i <= endLine && !anchor; i++) {
    anchor = lineMapping.getCommentAnchor(i)
  }

  if (!anchor) {
    // No commentable lines in selection
    return
  }

  // Find the file
  const file = state.files.find((f) => f.filename === anchor!.filename)
  if (!file) return

  // Find existing thread for this location (all comments on this line)
  const thread = state.comments.filter(
    (c) => c.filename === anchor!.filename && c.line === anchor!.line && c.side === anchor!.side
  )

  // Build diff context from the selection range
  const contextLines: string[] = []
  for (let i = startLine; i <= endLine; i++) {
    const line = lineMapping.getLine(i)
    if (line && lineMapping.isCommentable(i)) {
      contextLines.push(line.rawLine)
    }
  }

  // Suspend TUI immediately for fast response
  ctx.suspendRenderer()

  // Get current username (GitHub username for PR mode, @you for local)
  // Use cached value if available, otherwise fall back to @you
  // We don't make a network call here to keep the editor opening instant
  // The actual username will be fetched when submitting the comment
  const username = (state.appMode === "pr" && ctx.getCachedCurrentUser()) || "@you"

  try {
    const rawContent = await openCommentEditor({
      diffContent: contextLines.length > 0 ? contextLines.join("\n") : file.content,
      filePath: anchor.filename,
      line: anchor.line,
      thread,
      username,
    })

    if (rawContent !== null) {
      const result = parseEditorOutput(rawContent)

      // Handle edited comments
      for (const [shortId, newBody] of result.editedComments) {
        // Find the full comment by short ID
        const comment = state.comments.find((c) => c.id.startsWith(shortId) || c.id === shortId)
        if (!comment) continue

        // Get the current display body (localEdit or body)
        const currentBody = comment.localEdit ?? comment.body
        // Compare trimmed versions to avoid whitespace-only changes
        if (newBody.trim() === currentBody.trim()) continue

        let updatedComment: Comment

        if (comment.status === "synced") {
          // For synced comments, store edit in localEdit (user presses S to push)
          // If edit matches original body, clear localEdit
          if (newBody === comment.body) {
            updatedComment = { ...comment, localEdit: undefined }
          } else {
            updatedComment = { ...comment, localEdit: newBody }
          }
        } else {
          // For local/pending comments, edit body directly
          updatedComment = { ...comment, body: newBody }
        }

        ctx.setState((s) => ({
          ...s,
          comments: s.comments.map((c) => (c.id === comment.id ? updatedComment : c)),
        }))
        await persistComment(updatedComment, ctx.source)
      }

      // Handle new reply
      if (result.newReply) {
        const comment = createComment(
          anchor.filename,
          anchor.line,
          result.newReply,
          anchor.side,
          username
        )
        // Use the selection context if available, otherwise extract from file
        comment.diffHunk =
          contextLines.length > 0 ? contextLines.join("\n") : extractDiffHunk(file.content, anchor.line)

        // If there's an existing thread, mark as reply to the last comment
        if (thread.length > 0) {
          comment.inReplyTo = thread[thread.length - 1]!.id
        }

        ctx.setState((s) => addComment(s, comment))
        await persistComment(comment, ctx.source)
      }
    }
  } finally {
    // Exit visual mode if we were in it
    const currentVimState = ctx.getVimState()
    if (currentVimState.mode === "visual-line") {
      ctx.setVimState(exitVisualMode(currentVimState))
    }

    // Resume TUI
    ctx.resumeRenderer()
    ctx.render()
  }
}

/**
 * Get the comment under cursor (in diff view) or selected comment (in comments view)
 */
export function getCurrentComment(ctx: CommentsContext): Comment | null {
  const state = ctx.getState()
  const vimState = ctx.getVimState()
  const lineMapping = ctx.getLineMapping()

  if (state.viewMode === "comments") {
    // In comments view, use selected comment
    const visibleComments = getVisibleComments(state)
    const threads = groupIntoThreads(visibleComments)
    const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
    const selectedNav = navItems[state.selectedCommentIndex]
    return selectedNav?.comment ?? null
  } else {
    // In diff view, find comment for current cursor position
    const anchor = lineMapping.getCommentAnchor(vimState.line)
    if (!anchor) return null

    // Find submittable comments on this line:
    // - local comments (not yet on GitHub)
    // - synced comments with localEdit (pending update)
    const submittableComments = state.comments.filter(
      (c) =>
        c.filename === anchor.filename &&
        c.line === anchor.line &&
        c.side === anchor.side &&
        (c.status === "local" || c.localEdit !== undefined)
    )

    // Return the last submittable comment (most recent)
    return submittableComments[submittableComments.length - 1] ?? null
  }
}

/**
 * Submit a single comment immediately to GitHub
 */
export async function handleSubmitSingleComment(
  ctx: CommentsContext,
  comment?: Comment
): Promise<void> {
  const state = ctx.getState()

  // Check we're in PR mode
  if (ctx.mode !== "pr" || !ctx.prInfo) {
    return
  }

  // Get the comment to submit
  const toSubmit = comment ?? getCurrentComment(ctx)
  if (!toSubmit) {
    return
  }

  // Check if this is an edit to a synced comment
  const isEdit = toSubmit.status === "synced" && toSubmit.localEdit !== undefined

  // Must be either local or an edited synced comment
  if (toSubmit.status !== "local" && !isEdit) {
    return
  }

  const { owner, repo, number: prNumber } = ctx.prInfo
  let result: SubmitResult

  if (isEdit && toSubmit.githubId) {
    // Update existing comment on GitHub
    result = await updateComment(owner, repo, toSubmit.githubId, toSubmit.localEdit!)
  } else {
    // New comment - need head SHA
    let headSha: string
    try {
      headSha = await getPrHeadSha(prNumber, owner, repo)
    } catch (err) {
      ctx.setState((s) => showToast(s, "Failed to get PR info", "error"))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 5000)
      return
    }

    // Check if this is a reply
    if (toSubmit.inReplyTo) {
      // Find parent comment's GitHub ID
      const parentComment = state.comments.find((c) => c.id === toSubmit.inReplyTo)
      if (!parentComment?.githubId) {
        // Can't reply to unsynced comment
        return
      }
      result = await submitReply(owner, repo, prNumber, toSubmit, parentComment.githubId)
    } else {
      result = await submitSingleComment(owner, repo, prNumber, toSubmit, headSha)
    }
  }

  if (result.success) {
    // Ensure we have the author set (might be missing for older comments)
    let author = toSubmit.author
    if (!author) {
      try {
        author = await getCurrentUser()
      } catch {
        // Leave undefined if we can't get the user
      }
    }

    let updatedComment: Comment
    let toastMessage: string

    if (isEdit) {
      // For edits: update body with localEdit content, clear localEdit
      updatedComment = {
        ...toSubmit,
        body: toSubmit.localEdit!,
        localEdit: undefined,
        author,
      }
      toastMessage = "Comment updated"
    } else {
      // For new comments: set synced status and GitHub IDs
      updatedComment = {
        ...toSubmit,
        status: "synced",
        githubId: result.githubId,
        githubUrl: result.githubUrl,
        author,
      }
      toastMessage = "Comment submitted"
    }

    // Update state and show success toast
    ctx.setState((s) => ({
      ...s,
      comments: s.comments.map((c) => (c.id === toSubmit.id ? updatedComment : c)),
    }))
    ctx.setState((s) => showToast(s, toastMessage, "success"))

    // Persist to storage
    await saveComment(updatedComment, ctx.source)

    ctx.render()

    // Auto-clear toast after 3 seconds
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 3000)
  } else {
    // Check for pending review error and provide actionable message
    let errorMessage = result.error ?? "Failed to submit comment"
    if (errorMessage.includes("pending review") || errorMessage.includes("user_id can only have one")) {
      errorMessage = "You have a pending review. Use gS to submit as review instead."
    }
    ctx.setState((s) => showToast(s, errorMessage, "error"))
    ctx.render()

    // Auto-clear error toast after 5 seconds
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 5000)
  }
}

/**
 * Delete a comment.
 * Local comments are deleted immediately.
 * Synced comments show a confirmation dialog before deleting on GitHub.
 */
export async function handleDeleteComment(
  ctx: CommentsContext,
  comment?: Comment
): Promise<void> {
  // Get the comment to delete
  const toDelete = comment ?? getCurrentComment(ctx)
  if (!toDelete) {
    return
  }

  // Check if comment is synced (exists on GitHub)
  if (toDelete.status === "synced") {
    // Must be in PR mode with valid prInfo and have a GitHub ID
    if (ctx.mode !== "pr" || !ctx.prInfo || !toDelete.githubId) {
      ctx.setState((s) => showToast(s, "Cannot delete: missing GitHub info", "error"))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 3000)
      return
    }

    // Show confirmation dialog
    const truncatedBody = toDelete.body.length > 50
      ? toDelete.body.slice(0, 47) + "..."
      : toDelete.body
    
    ctx.setState((s) =>
      showConfirmDialog(s, {
        title: "Delete Comment",
        message: "Delete this comment on GitHub?",
        details: truncatedBody,
        onConfirm: () => executeDeleteOnGitHub(ctx, toDelete),
        onCancel: () => {
          ctx.setState(closeConfirmDialog)
          ctx.render()
        },
      })
    )
    ctx.render()
    return
  }

  // Local comments: delete immediately
  await performDelete(ctx, toDelete)
}

/**
 * Execute the GitHub delete after confirmation
 */
async function executeDeleteOnGitHub(ctx: CommentsContext, toDelete: Comment): Promise<void> {
  if (!ctx.prInfo || !toDelete.githubId) {
    ctx.setState((s) => closeConfirmDialog(showToast(s, "Cannot delete: missing GitHub info", "error")))
    ctx.render()
    return
  }

  const { owner, repo } = ctx.prInfo

  // Close dialog and show loading toast
  ctx.setState((s) => closeConfirmDialog(showToast(s, "Deleting comment...", "info")))
  ctx.render()

  // Delete on GitHub
  const result = await deleteGitHubComment(owner, repo, toDelete.githubId)

  if (!result.success) {
    ctx.setState((s) => showToast(s, result.error ?? "Failed to delete comment", "error"))
    ctx.render()
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 5000)
    return
  }

  // Delete locally
  await performDelete(ctx, toDelete)
}

/**
 * Perform the actual delete (from state and storage)
 */
async function performDelete(ctx: CommentsContext, toDelete: Comment): Promise<void> {
  // Delete the comment from state
  ctx.setState((s) => deleteComment(s, toDelete.id))

  // Delete from storage
  await deleteCommentFile(toDelete.id, ctx.source)

  // Show success toast
  ctx.setState((s) => showToast(s, "Comment deleted", "success"))
  ctx.render()

  // Auto-clear toast after 3 seconds
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, 3000)
}
