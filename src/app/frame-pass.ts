import { TextRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { keepAlive } from "../utils/renderables"
import type { FeedIsland } from "./feed"
import type { SplitDiff } from "./split-diff"
import type { UnifiedDiff } from "./unified-diff"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { FileParses } from "../vim-diff/file-parses"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"
import { splitOn as isSplitOn } from "./column-status"
import { commentsSeenOnScreen } from "./comments-seen"
import { createDiffPass } from "./diff-pass"
import { viewSlotOf, type ViewSlot } from "./view-slot"
import { diffCursorShown } from "./diff-focus"
import { promptOpenIn } from "./open-prompt"
import type { AppShell } from "./shell"
import type { Frame } from "./frame"
import { confirmDialogModel } from "../components/confirm-dialog-model"
import type { HelpState } from "../features/help/state"
import type { ConfirmState } from "../features/confirm/state"
import type { SyncPreviewState } from "../features/sync-preview/state"
import type { ReviewPreviewState } from "../features/review-preview/state"
import type { FilePickerState } from "../features/file-picker/state"
import type { CommentsPickerState } from "../features/comments-picker/state"
import type { OccurrencePickerState } from "../features/occurrence-picker/state"
import type { MarksPickerState } from "../features/marks/picker-state"
import type { GlobalMarksState } from "../features/marks/state"
import type { ActivityFeedState } from "../features/feed/state"
import type { VisitState } from "../features/visit/state"
import type { PendingReviewState } from "../features/review-preview/pending-state"
import type { ToastState } from "../features/toast/state"
import type { PrCommentInputState } from "../features/pr-info-panel/comment-input-state"
import type { CommitPickerState } from "../features/commit-picker/state"
import type { ActionMenuState } from "../features/action-menu/state"
import type { LinePeekState } from "../features/line-peek/state"
import type { BlamePeekState } from "../features/blame/peek-state"
import type { BlameColumnsState } from "../features/blame/column-state"
import type { MentionsState } from "../features/mentions/state"
import type { CommentDraftsState } from "../features/inline-comment-overlay/drafts-state"

export interface FramePassContext {
  // Mutable state accessors
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  getSearchState: () => SearchState
  getFlashState: () => FlashState
  getCachedCurrentUser: () => string | null
  /** Returns the persistent PRInfoPanel instance (PR mode only; null in local mode). */
  getPrInfoPanel: () => PRInfoPanelClass | null
  // UI panels
  renderer: CliRenderer
  shell: AppShell
  feed: FeedIsland
  split: SplitDiff
  unified: UnifiedDiff
  /** The files' own text and their parses, which both diff views colour rows from. */
  parses: FileParses
  help: HelpState
  confirm: ConfirmState
  syncPreview: SyncPreviewState
  reviewPreview: ReviewPreviewState
  pendingReview: Pick<PendingReviewState, "review">
  toast: Pick<ToastState, "current">
  prCommentInput: Pick<PrCommentInputState, "current">
  filePicker: FilePickerState
  commentsPicker: CommentsPickerState
  occurrencePicker: OccurrencePickerState
  marksPicker: MarksPickerState
  commitPicker: CommitPickerState
  actionMenu: ActionMenuState
  linePeek: LinePeekState
  blamePeek: BlamePeekState
  blameColumns: Pick<BlameColumnsState, "columns">
  marks: Pick<GlobalMarksState, "marks">
  activityFeed: Pick<ActivityFeedState, "snapshot">
  visit: Pick<VisitState, "watermark" | "markSeen">
  mentions: Pick<MentionsState, "pool" | "searching">
  commentDrafts: Pick<CommentDraftsState, "drafts">
  /** The keymap's command `keys` (command-keys.ts); the keys are built after the pass. */
  getCommandKeys: () => ReadonlyMap<string, string>
  // Helper
  updateFileTreePanel: () => void
  /** Hands the pass's snapshot to every view that derives its own model from it. */
  publishFrame: (frame: Frame) => void
}

/**
 * One render pass: it draws the diff views, publishes the frame every
 * other island follows, and mounts the view the content row shows. The
 * diff views draw ahead of publish because the frame carries their readout.
 */
export function createFramePass(ctx: FramePassContext): () => void {
  const errorText = keepAlive(new TextRenderable(ctx.renderer, { fg: colors.error }))
  const emptyText = keepAlive(new TextRenderable(ctx.renderer, { content: "No changes to display", fg: colors.textDim }))
  const diffPass = createDiffPass(ctx)

  return function render() {
    // The blame peek blames a line of the diff; kept across a switch it would come back over a line it no longer names.
    if (ctx.getState().viewMode !== "diff") ctx.blamePeek.close()
    const state = ctx.getState()
    const vimState = ctx.getVimState()
    const mapping = ctx.getLineMapping()
    const searchState = ctx.getSearchState()
    const flashState = ctx.getFlashState()
    const now = Date.now()

    ctx.updateFileTreePanel()
    // After the panel update, which sets the width the diff pane is measured against.
    const splitOn = isSplitOn(state, ctx.split)
    const help = { open: ctx.help.open(), scroll: ctx.help.scroll() }
    const asked = ctx.confirm.dialog()
    const confirmDialog = asked ? confirmDialogModel(asked) : null
    const syncPreview = ctx.syncPreview.open() ? { loading: ctx.syncPreview.loading() } : null
    const reviewPreview = ctx.reviewPreview.open() ? ctx.reviewPreview.snapshot() : null
    const filePicker = ctx.filePicker.open() ? ctx.filePicker.snapshot() : null
    const commentsPicker = ctx.commentsPicker.open() ? ctx.commentsPicker.snapshot() : null
    const occurrencePicker = ctx.occurrencePicker.open() ? ctx.occurrencePicker.snapshot() : null
    const marksPicker = ctx.marksPicker.open() ? ctx.marksPicker.snapshot() : null
    const commitPicker = ctx.commitPicker.open() ? ctx.commitPicker.snapshot() : null
    const actionMenu = ctx.actionMenu.open() ? ctx.actionMenu.snapshot() : null
    const linePeek = ctx.linePeek.open() ? ctx.linePeek.snapshot() : null
    const blamePeek = ctx.blamePeek.peek()
    const marks = ctx.marks.marks()
    const feed = ctx.activityFeed.snapshot()
    const visit = ctx.visit.watermark()
    const focused = diffCursorShown(state, {
      prompt: promptOpenIn(state, searchState, { filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, feed }),
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
    })

    const prInfoPanel = ctx.getPrInfoPanel()
    const { slot, withTree } = viewSlotOf(state, { overview: prInfoPanel !== null })
    // Mounted once the frame is published.
    const view = viewOf(slot)
    diffPass.draw({
      state,
      vimState,
      mapping,
      searchState,
      flashState,
      blameColumns: ctx.blameColumns.columns(),
      marks,
      focused,
      diffShown: slot === "diff",
      splitOn,
    })

    if (visit) {
      const conversationOpen = state.viewMode === "state" && !!prInfoPanel?.isSectionExpandedNamed("conversation")
      ctx.visit.markSeen(commentsSeenOnScreen(state, { conversationOpen }))
    }

    const frame: Frame = {
      state,
      vimState,
      mapping,
      searchState,
      flashState,
      cachedCurrentUser: ctx.getCachedCurrentUser(),
      width: ctx.renderer.width,
      height: ctx.renderer.height,
      now,
      diff: diffPass.readout(splitOn, state.viewMode, vimState),
      help,
      confirmDialog,
      syncPreview,
      reviewPreview,
      pendingReview: ctx.pendingReview.review(),
      toast: ctx.toast.current(),
      prCommentInput: ctx.prCommentInput.current(),
      filePicker,
      commentsPicker,
      occurrencePicker,
      marksPicker,
      marks,
      feed,
      visit,
      commitPicker,
      actionMenu,
      linePeek,
      blamePeek,
      mentions: { pool: ctx.mentions.pool(), searching: ctx.mentions.searching() },
      commentDrafts: ctx.commentDrafts.drafts(),
      commandKeys: ctx.getCommandKeys(),
    }

    // The composer and the prompts focus their fields as publish's first
    // followers; the chat, which takes the keys only while neither is up, and
    // the review preview, which focuses its summary as it opens, follow them,
    // all before this call returns.
    ctx.publishFrame(frame)

    ctx.shell.setView(view, { withTree })

    function viewOf(shown: ViewSlot) {
      switch (shown) {
        case "error":
          errorText.content = `Error: ${state.error}`
          return errorText
        case "overview":
          return prInfoPanel!.getContainer()
        case "feed":
          return ctx.feed.host
        case "empty":
          return emptyText
        case "diff":
          return splitOn ? ctx.split.island.host : ctx.unified.island.host
      }
    }
  }
}
