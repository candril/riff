import type { AppState } from "../state"

export function composerOpen(state: AppState): boolean {
  const comments = state.inlineCommentOverlay
  return comments.open && (comments.mode === "compose" || comments.mode === "edit")
}

/** An overlay drawn over every panel is up, and it takes the keys from whichever has focus. */
export function overlayOpen(state: AppState, promptOpen: boolean): boolean {
  return (
    promptOpen ||
    state.reviewPreview.open ||
    state.showHelp ||
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
export function diffCursorShown(state: AppState, promptOpen: boolean): boolean {
  const comments = state.inlineCommentOverlay
  const readingComments = comments.open && state.focusedPanel === "comments"
  const chatting = state.chatOpen && state.focusedPanel === "chat"
  // Composing hides the diff's cursor, which keeps the textarea's cursor
  // visible; otherwise the diff would re-claim it after the textarea's
  // renderCursor pass.
  return !(composerOpen(state) || readingComments || chatting || overlayOpen(state, promptOpen))
}

/** Whether the chat's input has the keys: the chat is focused and nothing is drawn over it. */
export function chatInputFocused(state: AppState, promptOpen: boolean): boolean {
  return state.chatOpen && state.focusedPanel === "chat" && !composerOpen(state) && !overlayOpen(state, promptOpen)
}
