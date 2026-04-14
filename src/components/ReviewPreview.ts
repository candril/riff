/**
 * Review preview - balanced UI for submitting reviews
 * 
 * Controls:
 * - 1/2/3: Select review type
 * - Tab: Toggle between summary and comments
 * - Enter: Submit
 * - Ctrl+j: Newline in summary
 * - j/k, Space: Navigate and toggle comments
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"

import type { Comment } from "../types"
import type { ReviewPreviewState, ReviewPreviewSection } from "../state"

export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES"

export interface ValidatedComment {
  comment: Comment
  valid: boolean
  reason?: string
}

export interface ReviewPreviewProps {
  comments: ValidatedComment[]
  state: ReviewPreviewState
  isOwnPr?: boolean
}

const eventColors: Record<ReviewEvent, string> = {
  COMMENT: theme.blue,
  APPROVE: theme.green,
  REQUEST_CHANGES: theme.peach,
}

function renderBodyWithCursor(body: string, cursorOffset: number, focused: boolean): string {
  if (!focused) {
    return body || "(optional)"
  }
  const c = Math.max(0, Math.min(body.length, cursorOffset))
  return body.slice(0, c) + "█" + body.slice(c)
}

function canSubmit(
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

export function ReviewPreview({ 
  comments, 
  state, 
  isOwnPr = false,
}: ReviewPreviewProps) {
  const validComments = comments.filter(c => c.valid)
  const includedCount = validComments.filter(c => !state.excludedCommentIds.has(c.comment.id)).length
  const submitAllowed = canSubmit(state, includedCount, isOwnPr)
  const isFocused = (section: ReviewPreviewSection) => state.focusedSection === section
  const selectedColor = eventColors[state.selectedEvent]

  // Validation message
  let hint = ""
  if (isOwnPr && (state.selectedEvent === "APPROVE" || state.selectedEvent === "REQUEST_CHANGES")) {
    hint = "Cannot " + (state.selectedEvent === "APPROVE" ? "approve" : "request changes on") + " your own PR"
  } else if (!submitAllowed) {
    hint = "Add a comment or summary"
  }

  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 50,
      justifyContent: "center",
      alignItems: "center",
    },
    Box({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "#00000080" }),
    Box(
      {
        width: 72,
        flexDirection: "column",
        backgroundColor: theme.base,
      },
      // Header
      Box(
        { 
          flexDirection: "row", 
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        Text({ content: "Submit Review", fg: theme.text }),
        Text({ content: "Esc to close", fg: theme.overlay0 })
      ),

      // Pending review banner (if exists)
      state.pendingReviewLoading ? Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.surface0,
        },
        Text({ content: "Checking for pending review...", fg: theme.overlay0 })
      ) : state.pendingReview ? Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.yellow + "20",
        },
        Text({ content: `! Pending review on GitHub (${state.pendingReview.comments.length} comment${state.pendingReview.comments.length !== 1 ? "s" : ""})`, fg: theme.yellow }),
        Text({ 
          content: "  Will be merged with your new comments on submit", 
          fg: theme.subtext0,
        })
      ) : null,

      // Type selector
      Box(
        { 
          flexDirection: "row", 
          gap: 3,
          paddingX: 2,
          paddingY: 1,
        },
        ...(["COMMENT", "APPROVE", "REQUEST_CHANGES"] as ReviewEvent[]).map((event, i) => {
          const isSelected = event === state.selectedEvent
          const label = event === "REQUEST_CHANGES" ? "Request Changes" : event.charAt(0) + event.slice(1).toLowerCase()
          return Box(
            { 
              paddingX: 1,
              backgroundColor: isSelected ? eventColors[event] : undefined,
            },
            Text({ 
              content: `${i + 1}: ${label}`, 
              fg: isSelected ? theme.base : theme.subtext0,
            })
          )
        })
      ),

      // Summary input
      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
        },
        Text({
          content: "Summary" + (isFocused("input") ? " (editing)" : ""),
          fg: isFocused("input") ? theme.text : theme.subtext0,
        }),
        Box(
          {
            paddingX: 1,
            paddingY: 1,
            marginTop: 1,
            minHeight: 2,
            borderStyle: "single",
            borderColor: isFocused("input") ? theme.subtext0 : theme.surface1,
          },
          Text({
            content: renderBodyWithCursor(state.body, state.cursorOffset, isFocused("input")),
            fg: state.body ? theme.text : theme.overlay0,
          })
        )
      ),
      
      // Comments section (only show if there are comments)
      validComments.length > 0 ? Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ 
          content: `Comments (${includedCount}/${validComments.length})` + (isFocused("comments") ? " - j/k, space" : ""), 
          fg: isFocused("comments") ? theme.text : theme.subtext0,
        }),
        Box(
          {
            flexDirection: "column",
            marginTop: 1,
            maxHeight: 8,
            overflow: "hidden",
          },
          ...validComments.slice(0, 6).map((vc, i) => {
            const isHighlighted = isFocused("comments") && i === state.highlightedIndex
            const isIncluded = !state.excludedCommentIds.has(vc.comment.id)
            const isPending = vc.comment.status === "pending"
            // Pending comments (already on GitHub) show differently - they're always included
            const checkbox = isPending ? "●" : (isIncluded ? "✓" : "○")
            const checkboxColor = isPending ? theme.yellow : (isIncluded ? theme.green : theme.overlay0)
            const filename = vc.comment.filename.split("/").pop() || vc.comment.filename
            const preview = vc.comment.body.replace(/\s+/g, " ").slice(0, 40)
            
            return Box(
              {
                id: `review-comment-${vc.comment.id}`,
                flexDirection: "row",
                height: 1,
                paddingX: 1,
                backgroundColor: isHighlighted ? theme.surface0 : undefined,
              },
              Box(
                { width: 2, height: 1, flexShrink: 0 },
                Text({ id: `review-comment-cb-${vc.comment.id}`, content: checkbox, fg: checkboxColor })
              ),
              Text({ id: `review-comment-file-${vc.comment.id}`, content: `${filename}:${vc.comment.line ?? "?"} `, fg: theme.blue }),
              Text({ id: `review-comment-preview-${vc.comment.id}`, content: preview + (vc.comment.body.length > 40 ? "…" : ""), fg: theme.subtext0 })
            )
          }),
          validComments.length > 6 
            ? Box(
                { paddingX: 1 },
                Text({ content: `+${validComments.length - 6} more`, fg: theme.overlay0 })
              )
            : null
        )
      ) : null,

      // Footer
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        state.loading 
          ? Text({ content: "Submitting...", fg: theme.yellow })
          : state.error 
            ? Text({ content: state.error, fg: theme.red })
              : Text({ content: hint || "Tab: switch · Ctrl+j: newline", fg: hint ? theme.yellow : theme.overlay0 }),
        Box(
          {
            paddingX: 2,
            backgroundColor: submitAllowed && !state.loading ? selectedColor : theme.surface1,
          },
          Text({ 
            content: "Enter", 
            fg: submitAllowed && !state.loading ? theme.base : theme.overlay0,
          })
        )
      )
    )
  )
}

export { canSubmit }
