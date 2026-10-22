import type { AppKeyContext } from "./key-context"
import type { GlobalLayerKeyDeps } from "./global-layer-keys"
import { flashTargets } from "./list-flash"
import { createCommentsOverlayOpen } from "./comments-overlay-open"
import { jumpApplyContext } from "./jump-apply"
import * as commentsFeature from "../features/comments"
import * as feed from "../features/feed"
import * as folds from "../features/folds"

/** What the global keys need of the app, and whether a chord is pending, which they give way to. */
export function globalLayerKeyDeps(
  ctx: AppKeyContext,
  chord: { chordPending(): boolean },
): GlobalLayerKeyDeps {
  const { openCommentsOverlay, openCommentsPanelForCursor } = createCommentsOverlayOpen(ctx)
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    filePicker: ctx.filePicker,
    occurrencePicker: ctx.occurrencePicker,
    marksPicker: ctx.marksPicker,
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    getLineMapping: ctx.getLineMapping,
    getPane: ctx.getPane,
    quit: () => ctx.quit(),
    addComment: () => void commentsFeature.handleAddComment(ctx.commentsContext),
    jumpApply: jumpApplyContext(ctx),
    goToBottom: () => folds.handleGoToBottom(ctx.foldsContext),
    openBranchPr: (view) => ctx.openBranchPr(view),
    loadFeed: () => void feed.loadFeed(ctx.feedLoadContext),
    updateFileTreePanel: () => ctx.updateFileTreePanel(),
    startListFlash: (surface, ids, reserved) => ctx.flashHandler.startList(surface, ids, reserved),
    flashTargets: (state) => flashTargets(state, ctx),
    openCommentsOverlay,
    openCommentsPanelForCursor,
    chord,
  }
}
