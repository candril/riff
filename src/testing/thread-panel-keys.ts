import { registerThreadPanelKeys, type ThreadPanelKeyDeps } from "../features/inline-comment-overlay/view-keys"
import { createInitialState, openInlineCommentOverlay, type AppState } from "../state"
import type { Comment } from "../types"
import { keymapHarness } from "./keymap-keys"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createFeedState } from "../features/feed/state"
import { createPrInfoFilterState } from "../features/pr-info-panel/filter-state"
import { createActionMenuState } from "../features/action-menu/state"
import { createCommentDraftsState } from "../features/inline-comment-overlay/drafts-state"
import { createToastState } from "../features/toast/state"
import { createPrCommentInputState } from "../features/pr-info-panel/comment-input-state"
import { createChatColumnState } from "../features/chat/column-state"

const comment = (id: string, line: number, fields: Partial<Comment> = {}): Comment => ({
  id,
  filename: "src/greet.ts",
  line,
  side: "RIGHT",
  body: `about line ${line}`,
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  author: "ana",
  ...fields,
})

/** A thread with stored code and a local reply, then one without either. */
export const PANEL_COMMENTS: Comment[] = [
  comment("a", 1, { diffHunk: "@@ -1 +1 @@\n+export const a = 1" }),
  comment("ar", 1, { inReplyTo: "a", status: "local", author: "bo" }),
  comment("b", 3),
]

/** The panel open in view mode with focus, on the first comment unless `highlightedIndex` says otherwise. */
export function panelState(highlightedIndex = 0, patch: Partial<AppState> = {}): AppState {
  const base = { ...createInitialState([], [], "test", ""), comments: PANEL_COMMENTS, ...patch }
  const opened = openInlineCommentOverlay(base, "src/greet.ts", 0, "RIGHT", "view")
  return {
    ...opened,
    focusedPanel: "comments",
    inlineCommentOverlay: { ...opened.inlineCommentOverlay, highlightedIndex },
  }
}

/**
 * The panel's layers on a real keymap in front of a recording leftover,
 * with every hand-off to the app recorded in `calls`. Call it inside a test.
 */
export async function threadPanelKeys(initial: AppState, options: { chatOpen?: boolean } = {}) {
  const harness = await keymapHarness()
  const chatColumn = createChatColumnState()
  if (options.chatOpen) chatColumn.show()
  let state = initial
  const calls: string[] = []
  const record = (entry: string) => () => void calls.push(entry)
  const commentDrafts = createCommentDraftsState()
  const toast = createToastState()
  const deps: ThreadPanelKeyDeps = {
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render() {},
    toast,
    handleReplyExternal: record("replyInEditor"),
    handleEditExternal: record("editInEditor"),
    handleDelete: (c) => void calls.push(`delete ${c.id}`),
    handleSubmit: (c) => void calls.push(`submit ${c.id}`),
    handleToggleResolved: (t) => void calls.push(`resolve ${t.id}`),
    handleToggleOpenOnly: record("openOnly"),
    handleJumpAdjacent: (direction) => void calls.push(`adjacent ${direction}`),
    handleStartNewComment: record("new"),
    syncCursorToHighlight: record("sync"),
    getPanelLayout: () => null,
    handleCopyLink: (c) => void calls.push(`copyLink ${c.id}`),
    handleOpenInEditor: (c) => void calls.push(`editor ${c.id}`),
    handleOpenImages: (c) => void calls.push(`images ${c.id}`),
    onOpenLinks: (c, action) => void calls.push(`links ${c.id} ${action}`),
    onToggleHelp: record("help"),
    onReact: record("react"),
    searchActive: () => false,
    filePicker: createFilePickerState(),
    commentsPicker: createCommentsPickerState(),
    occurrencePicker: createOccurrencePickerState(),
    marksPicker: createMarksPickerState(),
    commitPicker: createCommitPickerState(),
    actionMenu: createActionMenuState(),
    activityFeed: createFeedState(),
    prInfoFilter: createPrInfoFilterState(),
    prCommentInput: createPrCommentInputState(),
    chat: { column: chatColumn },
    commentDrafts,
  }
  const unregister = registerThreadPanelKeys(harness.riffKeymap, deps)
  return {
    ...harness,
    calls,
    unregister,
    commentDrafts,
    toast,
    state: () => state,
    overlay: () => state.inlineCommentOverlay,
    set: (patch: Partial<AppState>) => {
      state = { ...state, ...patch }
    },
  }
}
