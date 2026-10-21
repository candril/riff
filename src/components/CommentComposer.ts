/**
 * CommentComposer — multiline input area used inside the inline comment
 * overlay (spec 039). Hosted by the thread panel island, which shows it
 * in compose / edit mode.
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

import { TextareaRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme } from "../theme"
import { keepAlive } from "../utils/renderables"

// The composer's keys are listed in the help overlay (g?). Ctrl-g alone is
// named here, as the way out to a roomier editor: the textarea is only as
// wide as the thread panel, and a placeholder that wraps eats the typing area.
const PLACEHOLDER_COMPOSE = "Type a comment… (Ctrl-g for $EDITOR)"
const PLACEHOLDER_EDIT = "Edit comment… (Ctrl-g for $EDITOR)"

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
  // A destroyed renderer takes the textarea down with it, and one that was
  // never mounted cannot move to another renderer. riff draws on one
  // renderer for its whole life; the frame tests make one per test.
  if (!composerInstance || composerInstance.isDestroyed || composerInstance.ctx !== renderer) {
    lastSyncKey = null
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
      maxHeight: 12,
    })
    const dispatch = () => {
      if (!activityCallback || !composerInstance) return
      activityCallback(composerInstance.plainText, composerInstance.cursorOffset)
    }
    composerInstance.onContentChange = dispatch
    composerInstance.onCursorChange = dispatch
    keepAlive(composerInstance)
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

/**
 * Overwrite the textarea's text and place the cursor at the end, then
 * refocus. Used when a draft is edited out-of-band in $EDITOR (Ctrl-g)
 * and the result needs to flow back into the live composer. Does not
 * change `lastSyncKey`, so the render pass's `syncComposerSession`
 * treats the same session as already-seeded and won't trample this value.
 */
export function setComposerValue(text: string): void {
  if (!composerInstance) return
  composerInstance.setText(text)
  composerInstance.cursorOffset = text.length
  composerInstance.focus()
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

/** The textarea the thread panel hosts; the same one every call, for as long as its renderer lives. */
export function composerTextarea(renderer: CliRenderer): TextareaRenderable {
  return ensureComposer(renderer)
}
