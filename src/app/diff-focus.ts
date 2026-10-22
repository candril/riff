import type { AppState } from "../state"

export function composerOpen(state: AppState): boolean {
  const comments = state.inlineCommentOverlay
  return comments.open && (comments.mode === "compose" || comments.mode === "edit")
}

/** Overlays whose state no longer lives in AppState; each feature factory adds its own. */
export interface OutsideOverlays {
  prompt: boolean
  help: boolean
}

/** An overlay drawn over every panel is up, and it takes the keys from whichever has focus. */
export function overlayOpen(state: AppState, outside: OutsideOverlays): boolean {
  return (
    outside.prompt ||
    state.reviewPreview.open ||
    outside.help ||
    state.filePicker.open ||
    state.commentsPicker.open ||
    state.marksPicker.open ||
    state.occurrencePicker.open ||
    state.commitPicker.open ||
    state.syncPreview.open ||
    state.confirmDialog !== null ||
    ((state.showLinePeek || state.blamePeek !== null) && state.viewMode === "diff")
  )
}

/**
 * Whether the diff's cursor is live: false while something else takes the
 * keys ahead of it (see keys.ts). Unified draws its block as the
 * terminal's own cursor, which no overlay drawn over the diff can cover,
 * so a cursor that is not live is not shown at all. A composer, a prompt
 * or the chat's input needs the terminal cursor for itself besides (spec 065).
 */
export function diffCursorShown(state: AppState, outside: OutsideOverlays): boolean {
  const comments = state.inlineCommentOverlay
  const readingComments = comments.open && state.focusedPanel === "comments"
  const chatting = state.chatOpen && state.focusedPanel === "chat"
  // Composing hides the diff's cursor, which keeps the textarea's cursor
  // visible; otherwise the diff would re-claim it after the textarea's
  // renderCursor pass.
  return !(composerOpen(state) || readingComments || chatting || overlayOpen(state, outside))
}

/** Whether the chat's input has the keys: the chat is focused and nothing is drawn over it. */
export function chatInputFocused(state: AppState, outside: OutsideOverlays): boolean {
  return state.chatOpen && state.focusedPanel === "chat" && !composerOpen(state) && !overlayOpen(state, outside)
}
