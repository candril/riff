import {
  commentDraftFor,
  getCommentsPanelScopeFilename,
  getInlineCommentOverlayComments,
  getInlineCommentOverlayHiddenThreadCount,
  unseenIn,
  visibleFeedEvents,
  visibleFeedRows,
} from "../state"
import { collectMentionCandidates } from "../utils/mentions"
import { commentPanelWidth } from "../features/inline-comment-overlay"
import type { ThreadPanelInput } from "../components/thread-panel-model"
import { feedModel, type FeedModel } from "../components/feed-model"
import { flashLabelsOn } from "../vim-diff/flash-state"
import type { Frame } from "./frame"

/** What the thread panel is handed for `frame`, or null while it is closed. */
export function threadPanelFrameInput({ state, flashState, width, now }: Frame): (ThreadPanelInput & { now: number }) | null {
  const overlay = state.inlineCommentOverlay
  if (!overlay.open) return null
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
    draft: commentDraftFor(state, overlay.filename, overlay.line, overlay.side),
    focused: state.focusedPanel === "comments",
    expanded: overlay.expanded,
    width: commentPanelWidth(width, overlay.expanded),
    mentionPicker: overlay.mentionPicker,
    emojiPicker: overlay.emojiPicker,
    mentionCandidates: collectMentionCandidates(state),
    mentionSearchQuery: state.mentionSearchQuery,
    expandedThreadIds: overlay.expandedThreadIds,
    unseenIds: new Set(unseenIn(state, state.comments).map((comment) => comment.id)),
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
export function feedFrameModel({ state, flashState, height, now }: Frame): FeedModel | null {
  if (state.error || state.viewMode !== "feed") return null
  return feedModel({
    events: visibleFeedEvents(state),
    rows: visibleFeedRows(state),
    feed: state.feed,
    unseenIds: new Set(unseenIn(state, state.comments).map((comment) => comment.id)),
    flashLabels: flashLabelsOn(flashState, "feed"),
    loading: state.feed.loading,
    now,
    height,
  })
}
