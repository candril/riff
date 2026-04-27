/**
 * CommentComposer — multiline input area used inside the inline comment
 * overlay (spec 039). Embedded by `InlineCommentOverlay` when the
 * overlay is in compose / edit mode.
 *
 * Wraps OpenTUI's native `TextareaRenderable` so we get cursor, paste,
 * undo/redo, Ctrl-w, Alt-arrow word jumps, mouse selection, etc. for
 * free instead of reimplementing them on top of our state.
 *
 * The textarea is a module-level singleton so its cursor/selection/edit
 * state survives re-renders. Open/close lifecycle is driven by
 * `syncComposerSession` / `endComposerSession`, called from the render
 * pass when the overlay enters or leaves compose/edit mode.
 */

import { Box, Text, TextareaRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme } from "../theme"

export interface CommentComposerProps {
  /** "compose" => new reply / new comment; "edit" => updating an existing one */
  mode: "compose" | "edit"
  /** Optional one-line label shown above the input area */
  label?: string
  /** Renderer — needed to mount / focus the underlying textarea. */
  renderer: CliRenderer
}

const PLACEHOLDER_COMPOSE = "Type a comment… (Ctrl-s to save, Esc to cancel)"
const PLACEHOLDER_EDIT = "Edit comment… (Ctrl-s to save, Esc to cancel)"

let composerInstance: TextareaRenderable | null = null
let lastSyncKey: string | null = null

function ensureComposer(renderer: CliRenderer): TextareaRenderable {
  if (!composerInstance) {
    composerInstance = new TextareaRenderable(renderer, {
      id: "inline-comment-composer",
      backgroundColor: theme.surface0,
      textColor: theme.text,
      focusedBackgroundColor: theme.surface0,
      focusedTextColor: theme.text,
      placeholder: PLACEHOLDER_COMPOSE,
      placeholderColor: theme.overlay0,
      cursorColor: theme.blue,
      cursorStyle: { style: "block", blinking: true },
      wrapMode: "word",
      flexGrow: 1,
      minHeight: 3,
      maxHeight: 12,
    })
  }
  return composerInstance
}

/**
 * Drive the textarea from the current overlay state. Called from the
 * render pass: on the first render of a compose/edit session it seeds
 * the initial value and grabs focus; subsequent renders for the same
 * session are no-ops so we don't trample in-progress typing.
 *
 * The session key combines anchor + mode + editingId so switching from
 * compose to edit on the same line correctly re-seeds.
 */
export function syncComposerSession(
  renderer: CliRenderer,
  key: string,
  initialValue: string,
  mode: "compose" | "edit"
): void {
  const ta = ensureComposer(renderer)
  if (lastSyncKey === key) return
  lastSyncKey = key
  ta.placeholder = mode === "edit" ? PLACEHOLDER_EDIT : PLACEHOLDER_COMPOSE
  ta.setText(initialValue)
  ta.focus()
}

/** Read the textarea's current text. "" before the composer ever opens. */
export function readComposerValue(): string {
  return composerInstance?.plainText ?? ""
}

/** Tear down the current composer session — overlay is closing. */
export function endComposerSession(): void {
  if (lastSyncKey === null) return
  lastSyncKey = null
  composerInstance?.blur()
}

export function CommentComposer({ mode, label, renderer }: CommentComposerProps) {
  const textarea = ensureComposer(renderer)
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
      textarea
    ),
    Box(
      { flexDirection: "row", paddingX: 1 },
      Text({
        content: mode === "edit"
          ? "Ctrl-s save · Esc cancel"
          : "Ctrl-s save · Esc cancel",
        fg: theme.overlay0,
      })
    )
  )
}
