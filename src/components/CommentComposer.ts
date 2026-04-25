/**
 * CommentComposer — multiline input area used inside the inline comment
 * overlay (spec 039). Embedded by `InlineCommentOverlay` when the
 * overlay is in compose / edit mode.
 *
 * Pure rendering: the keystroke handling lives in
 * `src/features/inline-comment-overlay/input.ts`, which writes the
 * draft body back into `state.inlineCommentOverlay.input`.
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"

export interface CommentComposerProps {
  /** "compose" => new reply / new comment; "edit" => updating an existing one */
  mode: "compose" | "edit"
  /** Current draft body */
  text: string
  /** Optional one-line label shown above the input area */
  label?: string
  /** Width of the composer (used to size the wrap line) */
  width: number
}

const PLACEHOLDER_COMPOSE = "Type a comment… (Ctrl-s to save, Esc to cancel)"
const PLACEHOLDER_EDIT = "Edit comment… (Ctrl-s to save, Esc to cancel)"

export function CommentComposer({ mode, text, label, width }: CommentComposerProps) {
  const placeholder = mode === "edit" ? PLACEHOLDER_EDIT : PLACEHOLDER_COMPOSE
  const isEmpty = text.length === 0
  // Show a block cursor at the end of the draft so the user sees where
  // characters will land. We use a thin space + reverse glyph because
  // OpenTUI doesn't expose a real terminal cursor inside arbitrary boxes.
  const display = isEmpty ? placeholder : text + "▎"
  const fg = isEmpty ? theme.overlay0 : theme.text

  return Box(
    {
      flexDirection: "column",
      paddingX: 1,
      paddingY: 0,
      backgroundColor: theme.surface0,
      borderStyle: "single",
      borderColor: theme.blue,
    },
    label
      ? Box(
          { flexDirection: "row", paddingX: 1 },
          Text({ content: label, fg: theme.blue })
        )
      : null,
    Box(
      {
        flexDirection: "column",
        paddingX: 1,
        paddingY: 0,
        minHeight: 3,
      },
      Text({ content: display, fg })
    ),
    Box(
      { flexDirection: "row", paddingX: 1 },
      Text({
        content: "Ctrl-s save · Ctrl-j newline · Esc cancel",
        fg: theme.overlay0,
      })
    )
  )
}
