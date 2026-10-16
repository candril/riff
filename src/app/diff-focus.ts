import type { AppState } from "../state"

/**
 * Whether the diff's cursor is live: false while something else takes the
 * keys ahead of it (see global-keys.ts). Unified draws its block as the
 * terminal's own cursor, which no overlay drawn over the diff can cover,
 * so a cursor that is not live is not shown at all. A composer or a prompt
 * needs the terminal cursor for itself besides (spec 065).
 */
export function diffCursorShown(state: AppState, promptOpen: boolean): boolean {
  const comments = state.inlineCommentOverlay
  const composing = comments.open && (comments.mode === "compose" || comments.mode === "edit")
  const readingComments = comments.open && state.focusedPanel === "comments"
  const overlay =
    composing ||
    readingComments ||
    promptOpen ||
    state.reviewPreview.open ||
    state.showHelp ||
    state.filePicker.open ||
    state.commentsPicker.open ||
    state.occurrencePicker.open ||
    state.commitPicker.open ||
    state.syncPreview.open ||
    state.confirmDialog !== null ||
    (state.showLinePeek && state.viewMode === "diff")
  return !overlay
}
