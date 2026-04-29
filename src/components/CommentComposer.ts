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

/**
 * Activity callback shape — fires after every content or cursor change
 * so the @mention picker can detect whether the user is typing a
 * trigger. Receives the textarea's current plain text and absolute
 * cursor offset.
 */
type ComposerActivityCallback = (text: string, cursorOffset: number) => void

let composerInstance: TextareaRenderable | null = null
let lastSyncKey: string | null = null
let activityCallback: ComposerActivityCallback | null = null

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
    const dispatch = () => {
      if (!activityCallback || !composerInstance) return
      activityCallback(composerInstance.plainText, composerInstance.cursorOffset)
    }
    composerInstance.onContentChange = dispatch
    composerInstance.onCursorChange = dispatch
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
  mode: "compose" | "edit",
  onActivity?: ComposerActivityCallback
): void {
  const ta = ensureComposer(renderer)
  // Refresh the activity hook on every render so the closure always
  // points at the latest setState/render. Cheap and avoids stale state.
  activityCallback = onActivity ?? null
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
  activityCallback = null
  composerInstance?.blur()
}

/** Read the textarea's current cursor offset (0 if not yet mounted). */
export function readComposerCursorOffset(): number {
  return composerInstance?.cursorOffset ?? 0
}

/**
 * Splice `replacement` over the half-open range `[start, end)` of the
 * textarea's plain text and place the cursor immediately after the
 * inserted text. Used by the @mention picker to swap `@<query>` for
 * `@<username> ` on accept. `replaceText` (vs `setText`) preserves the
 * undo stack as a single edit so Ctrl-z rolls the mention back.
 */
export function replaceComposerRange(
  start: number,
  end: number,
  replacement: string
): void {
  if (!composerInstance) return
  const text = composerInstance.plainText
  const safeStart = Math.max(0, Math.min(text.length, start))
  const safeEnd = Math.max(safeStart, Math.min(text.length, end))
  const next = text.slice(0, safeStart) + replacement + text.slice(safeEnd)
  composerInstance.replaceText(next)
  composerInstance.cursorOffset = safeStart + replacement.length
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
