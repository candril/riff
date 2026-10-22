import type { AppKeyContext } from "./key-context"
import { createCommentsOverlayOpen, type CommentsOverlayOpen } from "./comments-overlay-open"
import { handleInput, type DiffViewInputContext } from "../features/diff-view"
import type { DiffKeyDeps } from "../features/diff-view/keys"
import * as commentsFeature from "../features/comments"
import * as fileNavigation from "../features/file-navigation"

/** `state` and `searchState` are snapshots, so build this for every key rather than keep one. */
export function diffInputContext(ctx: AppKeyContext, overlay: CommentsOverlayOpen): DiffViewInputContext {
  return {
    state: ctx.getState(),
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    vimHandler: ctx.vimHandler,
    cursorView: ctx.cursorView,
    searchState: ctx.getSearchState(),
    searchHandler: ctx.searchHandler,
    flashHandler: ctx.flashHandler,
    getCurrentComment: () => commentsFeature.getCurrentComment(ctx.commentsContext),
    handleAddComment: () => commentsFeature.handleAddComment(ctx.commentsContext),
    handleYank: ctx.handleYank,
    handleExpandDivider: ctx.handleExpandDivider,
    showAllFiles: () => ctx.executeAction("show-all-files"),
    showAllCommits: () => ctx.onCommitSelected(null),
    handleToggleViewed: (advanceToNext: boolean) =>
      fileNavigation.handleToggleViewed(advanceToNext, ctx.fileNavContext),
    handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(ctx.commentsContext),
    handleOpenInlineOverlay: overlay.openCommentsOverlay,
    handleOpenPanelView: overlay.openCommentsPanelForCursor,
  }
}

/** What the diff's keys need of the app, and of the chain view, the chord pending. */
export function diffKeyDeps(ctx: AppKeyContext, chain: { chordPending(): boolean }): DiffKeyDeps {
  const overlay = createCommentsOverlayOpen(ctx)
  return {
    getState: ctx.getState,
    getVimState: ctx.getVimState,
    toggleSplitView: () => ctx.toggleSplitView(),
    handle: (key) => handleInput(key, diffInputContext(ctx, overlay)),
    chain,
  }
}
