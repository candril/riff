/**
 * Review preview - balanced UI for submitting reviews
 *
 * Controls:
 * - 1/2/3 (in comments section): Select review type
 * - Tab: Toggle between summary and comments
 * - Enter / Ctrl-s: Submit
 * - j/k, Space (in comments section): Navigate and toggle comments
 *
 * The summary input is an OpenTUI `TextareaRenderable` (singleton in
 * ReviewSummaryComposer), so paste, undo/redo, word jumps, etc. work
 * for free.
 */

import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme } from "../theme"
import { getReviewSummaryRenderable } from "./ReviewSummaryComposer"
import {
  reviewPreviewModel,
  type ReviewCheckboxTone,
  type ReviewEvent,
  type ReviewStatusTone,
  type ValidatedComment,
} from "./review-preview-model"

import type { ReviewPreviewState } from "../state"

export type { ValidatedComment }

export interface ReviewPreviewProps {
  comments: ValidatedComment[]
  state: ReviewPreviewState
  isOwnPr?: boolean
  renderer: CliRenderer
}

const eventColors: Record<ReviewEvent, string> = {
  COMMENT: theme.blue,
  APPROVE: theme.green,
  REQUEST_CHANGES: theme.peach,
}

const checkboxColors: Record<ReviewCheckboxTone, string> = {
  pending: theme.yellow,
  included: theme.green,
  excluded: theme.overlay0,
}

const statusColors: Record<ReviewStatusTone, string> = {
  submitting: theme.yellow,
  error: theme.red,
  hint: theme.yellow,
  idle: theme.overlay0,
}

export function ReviewPreview({
  comments,
  state,
  isOwnPr = false,
  renderer,
}: ReviewPreviewProps) {
  const textarea = getReviewSummaryRenderable(renderer)
  const model = reviewPreviewModel(comments, state, isOwnPr)
  const selectedColor = eventColors[state.selectedEvent]
  const banner = model.banner

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
        backgroundColor: theme.mantle,
      },
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

      banner?.kind === "loading" ? Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: "Checking for pending review...", fg: theme.overlay0 })
      ) : banner?.kind === "pending" ? Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.yellow + "20",
        },
        Text({ content: `! Pending review on GitHub (${banner.count} comment${banner.count !== 1 ? "s" : ""})`, fg: theme.yellow }),
        Text({ 
          content: "  Will be merged with your new comments on submit", 
          fg: theme.subtext0,
        })
      ) : null,

      Box(
        { 
          flexDirection: "row", 
          gap: 3,
          paddingX: 2,
          paddingY: 1,
        },
        ...model.chips.map((chip) =>
          Box(
            { 
              paddingX: 1,
              backgroundColor: chip.selected ? eventColors[chip.event] : undefined,
            },
            Text({ 
              content: chip.label, 
              fg: chip.selected ? theme.base : theme.subtext0,
            })
          )
        )
      ),

      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
        },
        Text({
          content: "Summary" + (model.summaryFocused ? " (editing)" : ""),
          fg: model.summaryFocused ? theme.text : theme.subtext0,
        }),
        Box({ marginTop: 1, minHeight: 3 }, textarea)
      ),
      
      model.validCount > 0 ? Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ 
          content: `Comments (${model.includedCount}/${model.validCount})` + (model.commentsFocused ? " - j/k, space" : ""), 
          fg: model.commentsFocused ? theme.text : theme.subtext0,
        }),
        Box(
          {
            flexDirection: "column",
            marginTop: 1,
            maxHeight: 8,
            overflow: "hidden",
          },
          ...model.comments.map((row) =>
            Box(
              {
                id: `review-comment-${row.id}`,
                flexDirection: "row",
                height: 1,
                paddingX: 1,
                backgroundColor: row.highlighted ? theme.surface0 : undefined,
              },
              Box(
                { width: 2, height: 1, flexShrink: 0 },
                Text({ id: `review-comment-cb-${row.id}`, content: row.checkbox, fg: checkboxColors[row.checkboxTone] })
              ),
              Text({ id: `review-comment-file-${row.id}`, content: `${row.fileLabel} `, fg: theme.blue }),
              Text({ id: `review-comment-preview-${row.id}`, content: row.preview, fg: theme.subtext0 })
            )
          ),
          model.moreCount > 0 
            ? Box(
                { paddingX: 1 },
                Text({ content: `+${model.moreCount} more`, fg: theme.overlay0 })
              )
            : null
        )
      ) : null,

      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
        },
        Text({ content: model.status.text, fg: statusColors[model.status.tone] }),
        Box(
          {
            paddingX: 2,
            backgroundColor: model.submitEnabled ? selectedColor : theme.surface0,
          },
          Text({
            content: "Enter",
            fg: model.submitEnabled ? theme.base : theme.overlay0,
          })
        )
      )
    )
  )
}
