import type { Comment } from "../types"
import type { ReviewPreviewState } from "../state"

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

export interface ValidatedComment {
  comment: Comment
  valid: boolean
  reason?: string
}

export interface ReviewEventChip {
  event: ReviewEvent
  label: string
  selected: boolean
}

export type ReviewBanner = { kind: "loading" } | { kind: "pending"; count: number }

export type ReviewCheckboxTone = "pending" | "included" | "excluded"

export interface ReviewCommentRow {
  id: string
  checkbox: string
  checkboxTone: ReviewCheckboxTone
  fileLabel: string
  preview: string
  highlighted: boolean
}

export type ReviewStatusTone = "submitting" | "error" | "hint" | "idle"

export interface ReviewPreviewModel {
  chips: ReviewEventChip[]
  banner: ReviewBanner | null
  summaryFocused: boolean
  commentsFocused: boolean
  comments: ReviewCommentRow[]
  /** Valid comments past the six listed. */
  moreCount: number
  includedCount: number
  validCount: number
  status: { text: string; tone: ReviewStatusTone }
  submitEnabled: boolean
}

const EVENTS: ReviewEvent[] = ["COMMENT", "APPROVE", "REQUEST_CHANGES"]
const EVENT_LABELS: Record<ReviewEvent, string> = {
  COMMENT: "Comment",
  APPROVE: "Approve",
  REQUEST_CHANGES: "Request Changes",
}
const MAX_LISTED = 6
const PREVIEW_LENGTH = 40

export function canSubmit(
  state: ReviewPreviewState,
  includedCount: number,
  isOwnPr: boolean
): boolean {
  const event = state.selectedEvent
  if (isOwnPr && (event === "APPROVE" || event === "REQUEST_CHANGES")) return false
  if (event === "REQUEST_CHANGES" && includedCount === 0 && !state.body.trim()) return false
  if (event === "COMMENT" && includedCount === 0 && !state.body.trim()) return false
  return true
}

function banner(state: ReviewPreviewState): ReviewBanner | null {
  if (state.pendingReviewLoading) return { kind: "loading" }
  if (state.pendingReview) return { kind: "pending", count: state.pendingReview.comments.length }
  return null
}

function hint(state: ReviewPreviewState, submitAllowed: boolean, isOwnPr: boolean): string {
  if (isOwnPr && state.selectedEvent === "APPROVE") return "Cannot approve your own PR"
  if (isOwnPr && state.selectedEvent === "REQUEST_CHANGES") return "Cannot request changes on your own PR"
  return submitAllowed ? "" : "Add a comment or summary"
}

function status(state: ReviewPreviewState, hintText: string): ReviewPreviewModel["status"] {
  if (state.loading) return { text: "Submitting...", tone: "submitting" }
  if (state.error) return { text: state.error, tone: "error" }
  if (hintText) return { text: hintText, tone: "hint" }
  return { text: "Tab: switch · Enter: submit", tone: "idle" }
}

function commentRow(vc: ValidatedComment, state: ReviewPreviewState, highlighted: boolean): ReviewCommentRow {
  const { comment } = vc
  // A pending comment is already on GitHub and goes in with the review either way.
  const tone: ReviewCheckboxTone =
    comment.status === "pending" ? "pending" : state.excludedCommentIds.has(comment.id) ? "excluded" : "included"
  const filename = comment.filename.split("/").pop() || comment.filename
  const preview = comment.body.replace(/\s+/g, " ").slice(0, PREVIEW_LENGTH)
  return {
    id: comment.id,
    checkbox: tone === "pending" ? "●" : tone === "included" ? "✓" : "○",
    checkboxTone: tone,
    fileLabel: `${filename}:${comment.line ?? "?"}`,
    preview: preview + (comment.body.length > PREVIEW_LENGTH ? "…" : ""),
    highlighted,
  }
}

export function reviewPreviewModel(
  comments: ValidatedComment[],
  state: ReviewPreviewState,
  isOwnPr: boolean
): ReviewPreviewModel {
  const valid = comments.filter((c) => c.valid)
  const includedCount = valid.filter((c) => !state.excludedCommentIds.has(c.comment.id)).length
  const submitAllowed = canSubmit(state, includedCount, isOwnPr)
  const commentsFocused = state.focusedSection === "comments"
  return {
    chips: EVENTS.map((event, i) => ({
      event,
      label: `${i + 1}: ${EVENT_LABELS[event]}`,
      selected: event === state.selectedEvent,
    })),
    banner: banner(state),
    summaryFocused: state.focusedSection === "input",
    commentsFocused,
    comments: valid
      .slice(0, MAX_LISTED)
      .map((vc, i) => commentRow(vc, state, commentsFocused && i === state.highlightedIndex)),
    moreCount: Math.max(0, valid.length - MAX_LISTED),
    includedCount,
    validCount: valid.length,
    status: status(state, hint(state, submitAllowed, isOwnPr)),
    submitEnabled: submitAllowed && !state.loading,
  }
}
