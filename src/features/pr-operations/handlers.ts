/**
 * PR Operations handlers (sync, review submission, thread resolution)
 *
 * Handles GitHub PR operations like syncing comments, submitting reviews,
 * and toggling thread resolution.
 */

import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { PrInfo, SubmitResult } from "../../providers/github"
import {
  showToast,
  clearToast,
  getVisibleComments,
  setThreadResolved,
  closeReviewPreview,
  setReviewPreviewLoading,
  setReviewPreviewError,
} from "../../state"
import { gatherSyncItems, type ValidatedComment } from "../../components"
import { saveComment } from "../../storage"
import { flattenThreadsForNav, groupIntoThreads } from "../../utils/threads"
import {
  updateComment,
  submitReply,
  submitReview,
  toggleThreadResolution,
  getPrHeadSha,
  getCurrentUser,
} from "../../providers/github"
import { validateCommentsForSubmit } from "../comments"

export interface PrOperationsContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
  // Source for storage
  source: string
  // PR info
  prInfo: PrInfo | null
}

/**
 * Execute the sync operation - push local edits and replies to GitHub
 */
export async function handleExecuteSync(ctx: PrOperationsContext): Promise<void> {
  const state = ctx.getState()
  if (!ctx.prInfo) return

  const { owner, repo, number: prNumber } = ctx.prInfo
  const syncItems = gatherSyncItems(state.comments)

  if (syncItems.length === 0) {
    ctx.setState((s) => ({
      ...s,
      syncPreview: { ...s.syncPreview, open: false },
    }))
    ctx.render()
    return
  }

  // Set loading state
  ctx.setState((s) => ({
    ...s,
    syncPreview: { ...s.syncPreview, loading: true, error: null },
  }))
  ctx.render()

  let successCount = 0
  let failedCount = 0
  let lastError: string | null = null

  for (const item of syncItems) {
    try {
      if (item.type === "edit" && item.newBody && item.comment.githubId) {
        const result = await updateComment(owner, repo, item.comment.githubId, item.newBody)
        if (result.success) {
          // Update comment: clear localEdit, set body to new value
          const updatedComment: Comment = {
            ...item.comment,
            body: item.newBody,
            localEdit: undefined,
          }
          // Update in state
          ctx.setState((s) => ({
            ...s,
            comments: s.comments.map((c) => (c.id === updatedComment.id ? updatedComment : c)),
          }))
          await saveComment(updatedComment, ctx.source)
          successCount++
        } else {
          lastError = result.error || "Failed to update comment"
          failedCount++
        }
      }

      if (item.type === "reply" && item.parent?.githubId) {
        const result = await submitReply(owner, repo, prNumber, item.comment, item.parent.githubId)
        if (result.success) {
          // Update comment: set status to synced, add GitHub IDs
          const updatedComment: Comment = {
            ...item.comment,
            status: "synced",
            githubId: result.githubId,
            githubUrl: result.githubUrl,
          }
          // Update in state
          ctx.setState((s) => ({
            ...s,
            comments: s.comments.map((c) => (c.id === updatedComment.id ? updatedComment : c)),
          }))
          await saveComment(updatedComment, ctx.source)
          successCount++
        } else {
          lastError = result.error || "Failed to submit reply"
          failedCount++
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error"
      failedCount++
    }
  }

  // Close sync preview
  ctx.setState((s) => ({
    ...s,
    syncPreview: { ...s.syncPreview, open: false, loading: false },
  }))

  // Show result toast
  if (failedCount === 0) {
    ctx.setState((s) => showToast(s, `Synced ${successCount} change${successCount !== 1 ? "s" : ""}`, "success"))
  } else if (successCount > 0) {
    ctx.setState((s) => showToast(s, `Synced ${successCount}, failed ${failedCount}: ${lastError}`, "error"))
  } else {
    ctx.setState((s) => showToast(s, `Sync failed: ${lastError}`, "error"))
  }

  ctx.render()

  // Auto-clear toast
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, 4000)
}

/**
 * Toggle the resolved state of the selected thread
 */
export async function handleToggleThreadResolved(ctx: PrOperationsContext): Promise<void> {
  const state = ctx.getState()

  // Get current selection
  const visibleComments = getVisibleComments(state)
  const threads = groupIntoThreads(visibleComments)
  const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
  const selectedNav = navItems[state.selectedCommentIndex]

  if (!selectedNav?.thread) {
    return
  }

  const thread = selectedNav.thread
  const rootComment = thread.comments[0]
  if (!rootComment) return

  const newResolved = !thread.resolved

  // For local-only threads (no GitHub thread ID), just update locally
  if (!thread.githubThreadId) {
    // Update state with new resolved value
    ctx.setState((s) => setThreadResolved(s, rootComment.id, newResolved))
    // Persist the change - get the updated comment from state
    const updatedComment = ctx.getState().comments.find((c) => c.id === rootComment.id)
    if (updatedComment) {
      await saveComment(updatedComment, ctx.source)
    }
    ctx.render()
    return
  }

  // For GitHub threads, call the API
  if (state.appMode !== "pr") {
    return
  }

  const result = await toggleThreadResolution(thread.githubThreadId, thread.resolved)

  if (result.success) {
    const finalResolved = result.isResolved ?? newResolved
    // Update local state
    ctx.setState((s) => setThreadResolved(s, rootComment.id, finalResolved))
    // Persist the change - get the updated comment from state
    const updatedComment = ctx.getState().comments.find((c) => c.id === rootComment.id)
    if (updatedComment) {
      await saveComment(updatedComment, ctx.source)
    }

    // Show toast
    const toastMsg = finalResolved ? "Thread resolved" : "Thread reopened"
    ctx.setState((s) => showToast(s, toastMsg, "success"))
    ctx.render()

    // Auto-clear toast after 3 seconds
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 3000)
  } else {
    ctx.setState((s) => showToast(s, result.error ?? "Failed to update thread", "error"))
    ctx.render()

    // Auto-clear error toast after 5 seconds
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 5000)
  }
}

/**
 * Submit all local comments as a review batch (called from review preview)
 */
export async function handleConfirmReview(ctx: PrOperationsContext): Promise<void> {
  const state = ctx.getState()

  // Check we're in PR mode
  if (state.appMode !== "pr" || !ctx.prInfo) {
    return
  }

  // Get all local comments, excluding user-deselected ones, replies, and invalid comments
  const allLocalComments = state.comments.filter(
    (c) =>
      c.status === "local" && !c.inReplyTo && !state.reviewPreview.excludedCommentIds.has(c.id)
  )

  // Only submit comments that are valid (file exists in diff)
  const validatedComments = validateCommentsForSubmit(allLocalComments, state.files)
  const localComments = validatedComments.filter((vc) => vc.valid).map((vc) => vc.comment)

  const reviewEvent = state.reviewPreview.selectedEvent
  const hasBody = state.reviewPreview.body.trim().length > 0
  const hasPendingComments = (state.pendingReview?.comments.length ?? 0) > 0

  // For APPROVE, we don't need comments or body
  // For COMMENT or REQUEST_CHANGES, we need at least comments or body (or pending comments from GitHub)
  if (localComments.length === 0 && reviewEvent !== "APPROVE" && !hasBody && !hasPendingComments) {
    const invalidCount = validatedComments.filter((vc) => !vc.valid).length
    const msg =
      invalidCount > 0
        ? `No valid comments to submit (${invalidCount} skipped - not in diff)`
        : "Add a comment or summary to submit"
    ctx.setState((s) => setReviewPreviewError(s, msg))
    ctx.render()
    return
  }

  const prInfo = ctx.prInfo
  if (!prInfo) return

  // Set loading state
  ctx.setState((s) => setReviewPreviewLoading(s, true))
  ctx.render()

  // Get the PR head SHA
  const { owner, repo, number: prNumber } = prInfo
  let headSha: string
  try {
    headSha = await getPrHeadSha(prNumber, owner, repo)
  } catch (err) {
    ctx.setState((s) =>
      setReviewPreviewError(s, err instanceof Error ? err.message : "Failed to get PR info")
    )
    ctx.render()
    return
  }

  // Submit as a review batch with selected event and optional body
  // If there's a pending review, merge our comments into it
  const pendingReviewId = state.reviewPreview.pendingReview?.id
  const result = await submitReview(
    owner,
    repo,
    prNumber,
    localComments,
    headSha,
    state.reviewPreview.selectedEvent,
    state.reviewPreview.body || undefined,
    pendingReviewId
  )

  if (result.success) {
    // Update all submitted comments to synced
    // Get the current user to set as author on synced comments
    let currentUser: string | undefined
    try {
      currentUser = await getCurrentUser()
    } catch {
      // Leave undefined if we can't get the user
    }

    // Note: GitHub doesn't return individual IDs for batch comments,
    // so we mark them synced but without individual githubId
    const submittedIds = new Set(localComments.map((c) => c.id))

    ctx.setState((s) => ({
      ...s,
      comments: s.comments.map((c) =>
        submittedIds.has(c.id) ? { ...c, status: "synced" as const, author: c.author || currentUser } : c
      ),
    }))

    // Close the review preview and show success toast
    const pendingReviewCommentCount = state.reviewPreview.pendingReview?.comments.length ?? 0
    ctx.setState(closeReviewPreview)
    const eventLabel =
      state.reviewPreview.selectedEvent === "APPROVE"
        ? "Review approved"
        : state.reviewPreview.selectedEvent === "REQUEST_CHANGES"
          ? "Changes requested"
          : "Review submitted"
    const totalComments = localComments.length + pendingReviewCommentCount
    const mergedNote = pendingReviewCommentCount > 0 ? " (merged with pending)" : ""
    ctx.setState((s) =>
      showToast(
        s,
        `${eventLabel} (${totalComments} comment${totalComments !== 1 ? "s" : ""})${mergedNote}`,
        "success"
      )
    )

    // Persist to storage
    for (const comment of localComments) {
      await saveComment({ ...comment, status: "synced", author: comment.author || currentUser }, ctx.source)
    }

    ctx.render()

    // Auto-clear toast after 3 seconds
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 3000)
  } else {
    ctx.setState((s) => setReviewPreviewError(s, result.error ?? "Failed to submit review"))
    ctx.render()
  }
}
