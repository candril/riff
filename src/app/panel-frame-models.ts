import {
  getCommentsPanelScopeFilename,
  getInlineCommentOverlayComments,
  getInlineCommentOverlayHiddenThreadCount,
} from "../state"
import { unseenComments } from "../utils/visit"
import { visibleFeedEvents, visibleFeedRows } from "../features/feed/rows"
import { collectMentionCandidates } from "../utils/mentions"
import { draftIn } from "../features/inline-comment-overlay/drafts-state"
import type { ThreadPanelInput } from "../components/thread-panel-model"
import { feedModel, type FeedModel } from "../components/feed-model"
import { flashLabelsOn } from "../vim-diff/flash-state"
import { columnWidthsOf } from "./column-widths"
import { threadPanelGeometry } from "./thread-panel-geometry"
import { chatInputFocused } from "./diff-focus"
import { promptOpenIn } from "./open-prompt"
import type { Frame } from "./frame"

/** What the thread panel is handed for `frame`, or null while it is closed. */
export function threadPanelFrameInput({ state, chatOpen, chatExpanded, flashState, width, height, now, mentions, commentDrafts, composerText, composerPickers, visit }: Frame): (ThreadPanelInput & { now: number }) | null {
  const overlay = state.inlineCommentOverlay
  if (!overlay.open) return null
  const panel = threadPanelGeometry(state, { open: chatOpen, expanded: chatExpanded }, { width, height }, () => composerText)
  return {
    comments: getInlineCommentOverlayComments(state),
    scopeFilename: getCommentsPanelScopeFilename(state),
    composeFilename: overlay.filename,
    line: overlay.line,
    replyToThread: overlay.replyToThread === true,
    note: overlay.note === true,
    mode: overlay.mode,
    appMode: state.appMode,
    highlightedIndex: overlay.highlightedIndex,
    editingId: overlay.editingId,
    draft: draftIn(commentDrafts, { filename: overlay.filename, line: overlay.line, side: overlay.side }),
    focused: state.focusedPanel === "comments",
    expanded: overlay.expanded,
    width: panel.width,
    viewportRows: panel.budget.viewportRows,
    pickerRoom: panel.pickerRoom,
    mentionPicker: composerPickers.mention,
    emojiPicker: composerPickers.emoji,
    mentionCandidates: collectMentionCandidates(state, mentions.pool),
    mentionSearchQuery: mentions.searching,
    expandedThreadIds: overlay.expandedThreadIds,
    unseenIds: new Set(unseenComments(state.comments, visit).map((comment) => comment.id)),
    filter: overlay.filter,
    filterInput: overlay.filterInput,
    openOnly: state.threadPanelOpenOnly ? { hidden: getInlineCommentOverlayHiddenThreadCount(state) } : null,
    flashLabels: flashLabelsOn(flashState, "comments"),
    now,
  }
}

/**
 * The activity feed for `frame`, or null while another view is up, so it does
 * no work for a screen it is not on. An error takes the screen from it.
 */
export function feedFrameModel({ state, feed, visit, flashState, height, now }: Frame): FeedModel | null {
  if (state.error || state.viewMode !== "feed") return null
  return feedModel({
    events: visibleFeedEvents(feed, state.comments, visit),
    rows: visibleFeedRows(feed, state.comments, visit),
    feed,
    unseenIds: new Set(unseenComments(state.comments, visit).map((comment) => comment.id)),
    flashLabels: flashLabelsOn(flashState, "feed"),
    loading: feed.loading,
    now,
    height,
  })
}

/** The chat column for `frame`, or null while it is closed. */
export function chatColumnFrameModel(frame: Frame): { width: number; focused: boolean } | null {
  const { state, chatOpen, chatExpanded, searchState, width, help, confirmDialog, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, linePeek, blamePeek } = frame
  if (!chatOpen) return null
  const outside = {
    prompt: promptOpenIn(state, searchState, frame),
    help: help.open,
    confirm: confirmDialog !== null,
    syncPreview: syncPreview !== null,
    reviewPreview: reviewPreview !== null,
    filePicker: filePicker !== null,
    commentsPicker: commentsPicker !== null,
    occurrencePicker: occurrencePicker !== null,
    marksPicker: marksPicker !== null,
    commitPicker: commitPicker !== null,
    actionMenu: actionMenu !== null,
    linePeek: linePeek !== null,
    blamePeek: blamePeek !== null,
  }
  return { width: columnWidthsOf({ ...state, chatOpen, chatExpanded }, width).chat, focused: chatInputFocused(state, outside, chatOpen) }
}

export interface PrInfoPanelFrameModel {
  flashLabels: Map<string, string>
  filterOpen: boolean
  filter: string
  commentInput: { open: boolean; text: string; loading: boolean; error: string | null }
}

/**
 * What the PR info panel is handed for `frame`. Never null: the panel lives
 * on while another view is up, and is kept in step with the state all along.
 */
export function prInfoPanelFrameModel({ flashState, prCommentInput, prInfoFilter }: Frame): PrInfoPanelFrameModel {
  return {
    flashLabels: flashLabelsOn(flashState, "state"),
    filterOpen: prInfoFilter.filterInput,
    filter: prInfoFilter.filter,
    commentInput: prCommentInput,
  }
}
