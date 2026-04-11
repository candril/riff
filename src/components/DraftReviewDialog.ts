/**
 * Bigger, editable-ish preview dialog for a Claude-drafted inline PR
 * comment (spec 036). Displayed when `state.draftReview` is non-null.
 *
 * Interaction (handled in `src/app/global-keys.ts`, not here):
 *   y / Y / Enter  → post the comment (approve)
 *   e / E          → open $EDITOR on the body, update the JSON, re-show
 *   d / D          → discard the draft file and clear the dialog
 *   n / N / Esc    → cancel (close dialog, draft file preserved)
 *
 * The preview is sized at 80% width × 70% height so the full body fits
 * comfortably. The body is rendered as a simple vertical stack of Text
 * lines — opentui wraps inside fixed-width boxes so long lines fold.
 */

import { Box, Text } from "@opentui/core"
import { theme, colors } from "../theme"
import type { DraftReviewDialogState } from "../state"

export interface DraftReviewDialogProps {
  review: DraftReviewDialogState
}

const MAX_BODY_LINES = 18

export function DraftReviewDialog({ review }: DraftReviewDialogProps) {
  const { filename, line, startLine, side, body } = review

  const range =
    startLine !== undefined && startLine !== line ? `${startLine}-${line}` : String(line)
  const target = `${filename}:${range} (${side})`

  // Body rendering: split on newlines, clamp to MAX_BODY_LINES, and let
  // the dialog container handle horizontal wrapping. This is a
  // display-only render; the source of truth is the JSON on disk.
  const bodyLines = body.split("\n")
  const clamped = bodyLines.slice(0, MAX_BODY_LINES)
  const overflow = bodyLines.length - clamped.length

  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 100,
      justifyContent: "center",
      alignItems: "center",
    },
    // Dim background
    Box({
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "#00000080",
    }),
    // Dialog box
    Box(
      {
        width: "80%",
        maxWidth: 120,
        flexDirection: "column",
        backgroundColor: theme.base,
        borderStyle: "rounded",
        borderColor: theme.yellow,
      },
      // Header
      Box(
        {
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
          flexDirection: "column",
        },
        Text({ content: "Post drafted PR comment?", fg: theme.yellow }),
        Text({ content: target, fg: colors.textMuted }),
      ),
      // Body preview
      Box(
        {
          flexDirection: "column",
          paddingX: 2,
          paddingY: 1,
          gap: 0,
        },
        ...clamped.map((ln) =>
          Text({ content: ln.length === 0 ? " " : ln, fg: theme.text }),
        ),
        overflow > 0
          ? Text({
              content: `… (${overflow} more line${overflow === 1 ? "" : "s"})`,
              fg: colors.textDim,
            })
          : null,
      ),
      // Footer with action hints
      Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingY: 1,
          backgroundColor: theme.mantle,
          gap: 2,
        },
        Text({ content: "y", fg: theme.green }),
        Text({ content: "es / ", fg: colors.textMuted }),
        Text({ content: "e", fg: theme.blue }),
        Text({ content: "dit / ", fg: colors.textMuted }),
        Text({ content: "d", fg: theme.red }),
        Text({ content: "iscard / ", fg: colors.textMuted }),
        Text({ content: "Esc", fg: colors.textDim }),
        Text({ content: " cancel", fg: colors.textMuted }),
      ),
    ),
  )
}
