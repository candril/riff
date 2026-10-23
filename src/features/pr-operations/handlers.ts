/**
 * PR Operations handlers (sync, review submission, thread resolution)
 *
 * Handles GitHub PR operations like syncing comments, submitting reviews,
 * and toggling thread resolution.
 */

import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { SubmitResult } from "../../providers/github/mutations"
import {
  setThreadResolved,
  withPendingComments,
} from "../../state"
import { gatherSyncItems } from "../../components"
import type { ValidatedComment } from "../../components/review-preview-model"
import { saveComment } from "../../storage/comments"
import { publishableLocalComments } from "../../utils/publishable"
import { type Thread } from "../../utils/threads"
import {
  updateComment,
  submitReply,
  submitSingleComment,
} from "../../providers/github/mutations"
import { commentRange, submitReview } from "../../providers/github/review"
import { getPrComments, toggleThreadResolution } from "../../providers/github/threads"
import { getCurrentUser } from "../../providers/github/exec"
import { getPrHeadSha } from "../../providers/github/content"
import { validateCommentsForSubmit } from "../comments"
import type { SyncPreviewState } from "../sync-preview/state"
import type { ReviewPreviewState } from "../review-preview/state"
import type { PendingReviewState } from "../review-preview/pending-state"
import type { ToastState } from "../toast/state"

export interface PrOperationsContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  syncPreview: Pick<SyncPreviewState, "close" | "startSync">
  reviewPreview: Pick<ReviewPreviewState, "selectedEvent" | "body" | "excludedCommentIds" | "startSubmit" | "fail" | "close">
  pendingReview: Pick<PendingReviewState, "review" | "clear">
  /** In the context, not an argument: Submit Review's keys hand over only the context. */
  reviewCalls: ReviewCalls
}

/** What a sync sends its items through; a test hands in its own, so no gh runs. */
export interface SyncCalls {
  updateComment: typeof updateComment
  submitReply: typeof submitReply
  submitSingleComment: typeof submitSingleComment
  getPrHeadSha: typeof getPrHeadSha
  saveComment: typeof saveComment
}

const githubSyncCalls: SyncCalls = { updateComment, submitReply, submitSingleComment, getPrHeadSha, saveComment }

/** What a review submit sends through; a test hands in its own, so no gh runs. */
export interface ReviewCalls {
  getPrHeadSha: typeof getPrHeadSha
  submitReview: typeof submitReview
  getCurrentUser: typeof getCurrentUser
  getPrComments: typeof getPrComments
  saveComment: typeof saveComment
}

export const githubReviewCalls: ReviewCalls = { getPrHeadSha, submitReview, getCurrentUser, getPrComments, saveComment }

/** `calls` is an argument so a test can drive the sync without spawning gh. */
export async function handleExecuteSync(ctx: PrOperationsContext, calls: SyncCalls = githubSyncCalls): Promise<void> {
  const state = ctx.getState()
  // Read once: a sync is sent to, and saved under, the review it started on.
  const { prInfo, source } = state
  if (!prInfo) return

  const { owner, repo, number: prNumber } = prInfo
  const syncItems = gatherSyncItems(state.comments)

  if (syncItems.length === 0) {
    ctx.syncPreview.close()
    ctx.render()
    return
  }

  ctx.syncPreview.startSync()
  ctx.render()

  let successCount = 0
  let failedCount = 0
  let lastError: string | null = null

  for (const item of syncItems) {
    try {
      if (item.type === "edit" && item.newBody && item.comment.githubId) {
        const result = await calls.updateComment(owner, repo, item.comment.githubId, item.newBody)
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
          await calls.saveComment(updatedComment, source)
          successCount++
        } else {
          lastError = result.error || "Failed to update comment"
          failedCount++
        }
      }

      if (item.type === "reply" && item.parent?.githubId) {
        const result = await calls.submitReply(owner, repo, prNumber, item.comment, item.parent.githubId)
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
          await calls.saveComment(updatedComment, source)
          successCount++
        } else {
          lastError = result.error || "Failed to submit reply"
          failedCount++
        }
      }

      if (item.type === "new") {
        // Need head SHA for new comments
        const headSha = await calls.getPrHeadSha(prNumber, owner, repo)
        const result = await calls.submitSingleComment(owner, repo, prNumber, item.comment, headSha, commentRange(item.comment))
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
          await calls.saveComment(updatedComment, source)
          successCount++
        } else {
          lastError = result.error || "Failed to submit comment"
          failedCount++
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error"
      failedCount++
    }
  }

  ctx.syncPreview.close()

  // Show result toast
  if (failedCount === 0) {
    ctx.toast.show(`Synced ${successCount} change${successCount !== 1 ? "s" : ""}`, "success")
  } else if (successCount > 0) {
    ctx.toast.show(`Synced ${successCount}, failed ${failedCount}: ${lastError}`, "error")
  } else {
    ctx.toast.show(`Sync failed: ${lastError}`, "error")
  }

  ctx.render()

  // Auto-clear toast
  setTimeout(() => {
    ctx.toast.clear()
    ctx.render()
  }, 4000)
}

/**
 * Toggle the resolved state of the given thread
 */
export async function handleToggleThreadResolved(
  ctx: PrOperationsContext,
  thread: Thread
): Promise<void> {
  const state = ctx.getState()

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
      await saveComment(updatedComment, state.source)
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
      await saveComment(updatedComment, state.source)
    }

    // Show toast
    const toastMsg = finalResolved ? "Thread resolved" : "Thread reopened"
    ctx.toast.show(toastMsg, "success")
    ctx.render()

    // Auto-clear toast after 3 seconds
    setTimeout(() => {
      ctx.toast.clear()
      ctx.render()
    }, 3000)
  } else {
    ctx.toast.show(result.error ?? "Failed to update thread", "error")
    ctx.render()

    // Auto-clear error toast after 5 seconds
    setTimeout(() => {
      ctx.toast.clear()
      ctx.render()
    }, 5000)
  }
}

/**
 * Submit all local comments as a review batch (called from review preview)
 */
export async function handleConfirmReview(ctx: PrOperationsContext): Promise<void> {
  const state = ctx.getState()
  const calls = ctx.reviewCalls
  // Read once, so the awaits below send and report what was submitted.
  const reviewEvent = ctx.reviewPreview.selectedEvent()
  const body = ctx.reviewPreview.body()
  const excludedCommentIds = ctx.reviewPreview.excludedCommentIds()
  const pendingReview = ctx.pendingReview.review()

  const { prInfo, source } = state
  // Check we're in PR mode
  if (state.appMode !== "pr" || !prInfo) {
    return
  }

  // Open local roots only: replies ride on their thread, user-deselected
  // ones stay home, and a thread resolved locally is done, not review
  // material (spec 049).
  const allLocalComments = publishableLocalComments(state.comments).filter(
    (c) => !c.inReplyTo && !excludedCommentIds.has(c.id)
  )

  // Only submit comments that are valid (file exists in diff)
  const validatedComments = validateCommentsForSubmit(allLocalComments, state.files)
  const localComments = validatedComments.filter((vc) => vc.valid).map((vc) => vc.comment)

  const hasBody = body.trim().length > 0
  const hasPendingComments = (pendingReview?.comments.length ?? 0) > 0

  // For APPROVE, we don't need comments or body
  // For COMMENT or REQUEST_CHANGES, we need at least comments or body (or pending comments from GitHub)
  if (localComments.length === 0 && reviewEvent !== "APPROVE" && !hasBody && !hasPendingComments) {
    const invalidCount = validatedComments.filter((vc) => !vc.valid).length
    const msg =
      invalidCount > 0
        ? `No valid comments to submit (${invalidCount} skipped - not in diff)`
        : "Add a comment or summary to submit"
    ctx.reviewPreview.fail(msg)
    ctx.render()
    return
  }

  // Set loading state
  ctx.reviewPreview.startSubmit()
  ctx.render()

  // Get the PR head SHA
  const { owner, repo, number: prNumber } = prInfo
  let headSha: string
  try {
    headSha = await calls.getPrHeadSha(prNumber, owner, repo)
  } catch (err) {
    ctx.reviewPreview.fail(err instanceof Error ? err.message : "Failed to get PR info")
    ctx.render()
    return
  }

  // Submit as a review batch with selected event and optional body
  // If there's a pending review, merge our comments into it
  const pendingReviewId = pendingReview?.id
  const result = await calls.submitReview(
    owner,
    repo,
    prNumber,
    localComments,
    headSha,
    reviewEvent,
    body || undefined,
    pendingReviewId
  )

  if (result.success) {
    // Update all submitted comments to synced
    // Get the current user to set as author on synced comments
    let currentUser: string | undefined
    try {
      currentUser = await calls.getCurrentUser()
    } catch {
      // Leave undefined if we can't get the user
    }

    // Fetch the submitted comments from GitHub to get their individual IDs.
    // The reviews API only returns the review-level ID, not individual comment IDs,
    // so we need to fetch them separately and match by (path, line, body).
    const submittedIds = new Set(localComments.map((c) => c.id))
    let remoteIdMap = new Map<string, { githubId: number; githubUrl: string }>()

    if (localComments.length > 0) {
      try {
        const remoteComments = await calls.getPrComments(owner, repo, prNumber)
        // Match each local comment to a remote comment by (path, line, body)
        // Build a pool of unmatched remote comments to avoid double-matching
        const unmatchedRemote = new Set(remoteComments.map((_, i) => i))

        for (const local of localComments) {
          for (const idx of unmatchedRemote) {
            const remote = remoteComments[idx]!
            if (
              remote.path === local.filename &&
              remote.line === local.line &&
              remote.body === local.body
            ) {
              remoteIdMap.set(local.id, {
                githubId: remote.id,
                githubUrl: remote.url,
              })
              unmatchedRemote.delete(idx)
              break
            }
          }
        }
      } catch {
        // If fetching fails, we still mark as synced (dedup will happen on next refresh)
      }
    }

    ctx.setState((s) => ({
      ...s,
      comments: s.comments.map((c) => {
        if (!submittedIds.has(c.id)) return c
        const remoteIds = remoteIdMap.get(c.id)
        return {
          ...c,
          status: "synced" as const,
          author: c.author || currentUser,
          ...(remoteIds ? { githubId: remoteIds.githubId, githubUrl: remoteIds.githubUrl } : {}),
        }
      }),
    }))

    // The draft is submitted now, so its id cannot take another submit. Its
    // comments come back synced with the comment poll or the next refresh,
    // and kept as pending copies they would show twice.
    ctx.pendingReview.clear()
    ctx.setState((s) => withPendingComments(s, null))

    // Close the review preview and show success toast
    const pendingReviewCommentCount = pendingReview?.comments.length ?? 0
    ctx.reviewPreview.close()
    const eventLabel =
      reviewEvent === "APPROVE"
        ? "Review approved"
        : reviewEvent === "REQUEST_CHANGES"
          ? "Changes requested"
          : "Review submitted"
    const totalComments = localComments.length + pendingReviewCommentCount
    const mergedNote = pendingReviewCommentCount > 0 ? " (merged with pending)" : ""
    ctx.toast.show(
      `${eventLabel} (${totalComments} comment${totalComments !== 1 ? "s" : ""})${mergedNote}`,
      "success"
    )

    // Persist to storage (with githubId if matched)
    for (const comment of localComments) {
      const remoteIds = remoteIdMap.get(comment.id)
      await calls.saveComment(
        {
          ...comment,
          status: "synced",
          author: comment.author || currentUser,
          ...(remoteIds ? { githubId: remoteIds.githubId, githubUrl: remoteIds.githubUrl } : {}),
        },
        source
      )
    }

    ctx.render()

    // Auto-clear toast after 3 seconds
    setTimeout(() => {
      ctx.toast.clear()
      ctx.render()
    }, 3000)
  } else {
    ctx.reviewPreview.fail(result.error ?? "Failed to submit review")
    ctx.render()
  }
}
