/**
 * ReviewSummaryComposer — multiline summary input used inside the
 * Submit Review modal. Wraps OpenTUI's `TextareaRenderable` so paste,
 * undo/redo, Ctrl-w, Alt-arrow word jumps, mouse selection, etc. all
 * work for free instead of being hand-rolled on top of state.
 *
 * Each renderer gets one textarea, which outlives the modal so its
 * cursor, selection and edit history survive every render. A textarea
 * belongs to the renderer that built it and cannot be mounted into
 * another, which is why they are kept per renderer rather than one per
 * process. Open/close lifecycle is driven by `syncReviewSummarySession`
 * / `endReviewSummarySession`, called from the render pass when the
 * modal opens/closes.
 *
 * Live edits flow back into `state.reviewPreview.body` via an
 * `onContentChange` listener so the dialog's "can submit" check stays
 * accurate as the user types.
 */

import { TextareaRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme } from "../theme"
import { keepAlive } from "../utils/renderables"

const PLACEHOLDER = "Summary (optional) — Enter to submit, Ctrl-J for a newline, Esc to cancel"

const textareas = new WeakMap<CliRenderer, TextareaRenderable>()
// One modal is open at a time, whichever renderer it belongs to.
let sessionTextarea: TextareaRenderable | null = null
let lastSyncKey: string | null = null
let lastFocused: boolean = false
let mirrorListener: ((value: string) => void) | null = null

function ensureComposer(renderer: CliRenderer): TextareaRenderable {
  const existing = textareas.get(renderer)
  if (existing) return existing
  const textarea = new TextareaRenderable(renderer, {
    id: "review-summary-composer",
    backgroundColor: theme.surface0,
    textColor: theme.text,
    focusedBackgroundColor: theme.surface0,
    focusedTextColor: theme.text,
    placeholder: PLACEHOLDER,
    placeholderColor: theme.overlay0,
    cursorColor: theme.blue,
    cursorStyle: { style: "block", blinking: true },
    wrapMode: "word",
    flexGrow: 1,
    minHeight: 3,
    maxHeight: 10,
  })
  textarea.onContentChange = () => {
    if (textarea === sessionTextarea) mirrorListener?.(textarea.plainText)
  }
  keepAlive(textarea)
  textareas.set(renderer, textarea)
  return textarea
}

/**
 * Drive the textarea from the current modal state. On the first sync
 * for a given session it seeds the initial value and grabs focus;
 * subsequent syncs are no-ops so we don't trample in-progress typing.
 *
 * `focused` flips focus when the user Tab's between the summary and the
 * comments list. The mirror callback is updated on every call so it
 * always points at the live `setState` closure.
 */
export function syncReviewSummarySession(
  renderer: CliRenderer,
  key: string,
  initialValue: string,
  focused: boolean,
  onMirror: (value: string) => void
): void {
  const ta = ensureComposer(renderer)
  mirrorListener = onMirror
  if (lastSyncKey !== key || sessionTextarea !== ta) {
    sessionTextarea?.blur()
    sessionTextarea = ta
    lastSyncKey = key
    ta.setText(initialValue)
    lastFocused = false
  }
  if (lastFocused !== focused) {
    lastFocused = focused
    if (focused) ta.focus()
    else ta.blur()
  }
}

/** Read the open session's text. "" while no session is open. */
export function readReviewSummaryValue(): string {
  return sessionTextarea?.plainText ?? ""
}

/** Tear down the current session — modal is closing. */
export function endReviewSummarySession(): void {
  if (lastSyncKey === null) return
  sessionTextarea?.blur()
  sessionTextarea = null
  lastSyncKey = null
  lastFocused = false
  mirrorListener = null
}

/** The renderer's textarea, for the Submit Review modal to embed. */
export function getReviewSummaryRenderable(
  renderer: CliRenderer
): TextareaRenderable {
  return ensureComposer(renderer)
}
