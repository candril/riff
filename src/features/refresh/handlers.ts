/**
 * Refresh feature handlers
 *
 * Full reload of PR data, diff, and comments from scratch — carrying the
 * reader's position across it (spec 063).
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { SearchState } from "../../vim-diff/search-state"
import type { IgnoreMatcher } from "../../utils/ignore"
import {
  createInitialState,
  loadFileStatuses,
  updateFileStatuses,
  viewedFilenames,
} from "../../state"
import { PR_COMMITS_FETCH_LIMIT } from "../../providers/github/session"
import { mergeGitHubViewedStates } from "../../utils/viewed-status"
import { commentsInView, commentsWithRows } from "../../utils/notes"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { markVisit } from "../../utils/visit"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { Mark } from "../marks/types"
import type { HelpState } from "../help/state"
import type { ConfirmState } from "../confirm/state"
import type { SyncPreviewState } from "../sync-preview/state"
import type { ReviewPreviewState } from "../review-preview/state"
import type { FilePickerState } from "../file-picker/state"
import type { CommentsPickerState } from "../comments-picker/state"
import type { OccurrencePickerState } from "../occurrence-picker/state"
import type { MarksPickerState } from "../marks/picker-state"
import type { GlobalMarksState } from "../marks/state"
import type { ActivityFeedState } from "../feed/state"
import type { VisitState } from "../visit/state"
import type { CommitPickerState } from "../commit-picker/state"
import type { ActionMenuState } from "../action-menu/state"
import type { LinePeekState } from "../line-peek/state"
import type { BlamePeekState } from "../blame/peek-state"
import type { BlameColumnsState } from "../blame/column-state"
import type { CommentDraftsState } from "../inline-comment-overlay/drafts-state"
import type { ComposerPickersState } from "../inline-comment-overlay/composer-pickers-state"
import type { CodePeekState } from "../inline-comment-overlay/code-peek-state"
import type { JumpListState } from "../jumplist/state"
import type { PendingReviewState } from "../review-preview/pending-state"
import { loadPendingReview } from "../review-preview/load-pending"
import type { RecreatePrInfoPanel } from "../pr-info-panel/rebuild"
import { followReloadedMarks } from "./marks"
import type { RefreshSources } from "./sources"
import {
  capturePosition,
  refreshMessage,
  restorePosition,
  relocate,
  keepTreeHighlight,
  restoreSearch,
  wasForcePushed,
  type RefreshPosition,
} from "./position"
import type { ToastState } from "../toast/state"
import type { PrCommentInputState } from "../pr-info-panel/comment-input-state"
import type { LastRefreshState } from "./last-refresh-state"
import type { FileContentState } from "../file-content/state"
import type { CommitDiffsState } from "../commit-scope/diffs-state"
import type { FileFoldsState } from "../folds/file-folds-state"

export interface RefreshContext {
  sources: RefreshSources
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
  // Vim / search state
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  getSearchState: () => SearchState
  setSearchState: (s: SearchState) => void
  getMapping: () => DiffLineMapping
  rebuildLineMapping: () => void
  /** Scroll the restored cursor into view and redraw the cursor line. */
  revealCursor: () => void
  /** Recompute the surviving search pattern's matches against the new mapping. */
  refreshSearchMatches: () => void
  /** Re-read the activity feed's timeline (spec 070). */
  reloadFeed: () => void
  /** Not reset by a reload: only its stream is dropped, by a PR refresh. */
  feed: Pick<ActivityFeedState, "forgetStream">
  /** Not reset by createInitialState: a PR refresh begins a new visit, and a local reload drops it. */
  visit: Pick<VisitState, "seen" | "begin" | "reset">
  // The head riff is showing. Reading it before the reload is what makes a
  // force-push detectable; writing it back keeps context expansion pointed
  // at a commit that still exists.
  getHeadSha: () => string
  setHeadSha: (sha: string) => void
  // Rebuild the persistent PR info panel against the current state
  // (PRInfoPanelClass holds prInfo/files/comments in private fields set
  // in its constructor, so a refresh has to swap the instance). A panel
  // already up hands its folds over; a review that had none, such as a
  // local review just opened onto its PR, starts from `openSections`.
  recreatePrInfoPanel: RecreatePrInfoPanel
  saveMarks: (marks: readonly Mark[]) => void
  /** Not reset by a reload: followReloadedMarks moves each mark to where its line went. */
  marks: Pick<GlobalMarksState, "marks" | "replace">
  help: Pick<HelpState, "close">
  confirm: Pick<ConfirmState, "close">
  syncPreview: Pick<SyncPreviewState, "close">
  reviewPreview: Pick<ReviewPreviewState, "close">
  filePicker: Pick<FilePickerState, "close">
  commentsPicker: Pick<CommentsPickerState, "close">
  occurrencePicker: Pick<OccurrencePickerState, "close">
  marksPicker: Pick<MarksPickerState, "close">
  commitPicker: Pick<CommitPickerState, "close">
  actionMenu: Pick<ActionMenuState, "close">
  linePeek: Pick<LinePeekState, "close">
  blamePeek: Pick<BlamePeekState, "close">
  blameColumns: Pick<BlameColumnsState, "clear">
  commentDrafts: Pick<CommentDraftsState, "clear">
  composerPickers: Pick<ComposerPickersState, "clear">
  codePeek: Pick<CodePeekState, "close">
  jumpList: Pick<JumpListState, "clear">
  pendingReview: Pick<PendingReviewState, "clear" | "set" | "generation">
  toast: Pick<ToastState, "show" | "clear">
  prCommentInput: Pick<PrCommentInputState, "close">
  lastRefresh: Pick<LastRefreshState, "stamp">
  /** The opened runs of context survive a reload; the files read for them are read again. */
  fileContent: Pick<FileContentState, "expanded" | "clear" | "restoreExpanded">
  /** The reloaded review's commits may not be the ones these were fetched for. */
  commitDiffs: Pick<CommitDiffsState, "clear">
  /** Not reset by a reload: the files it finds newly viewed or ignored are folded on top. */
  fileFolds: Pick<FileFoldsState, "collapse">
  // App config (captured from options at init time)
  target: string | undefined
}

/**
 * Full refresh - reload everything from scratch (PR data, diff, comments)
 */
export async function handleRefresh(ctx: RefreshContext): Promise<void> {
  const state = ctx.getState()
  // A refresh is a look (spec 069): what was on screen when it began goes
  // into the watermark, not what the reader sees while gh is awaited.
  const seenAtStart = ctx.visit.seen()
  const position = capturePosition(state, ctx.getVimState(), ctx.getMapping(), ctx.getSearchState(), ctx.fileContent.expanded())

  // Show loading toast
  ctx.toast.show("Refreshing...", "info")
  ctx.render()

  try {
    let forcePushed = false

    if (state.appMode === "pr" && state.prInfo) {
      // PR mode - reload PR data
      const { owner, repo, number: prNumber } = state.prInfo
      const previousHeadSha = ctx.getHeadSha()
      const {
        prInfo: newPrInfo,
        diff: newDiff,
        comments: newComments,
        viewedStatuses,
        headSha,
      } = await ctx.sources.loadPrSession(prNumber, owner, repo)

      forcePushed = wasForcePushed(previousHeadSha, newPrInfo.commits ?? [], PR_COMMITS_FETCH_LIMIT)
      ctx.setHeadSha(headSha)
      // Saved before the new diff is parsed, so a diff that fails to parse
      // still records the look.
      const watermark = markVisit(state.comments, headSha, seenAtStart)
      void ctx.sources.saveVisit(state.source, watermark)

      // Parse diff into files
      const newFiles = sortFiles(parseDiff(newDiff))
      const newFileTree = buildFileTree(newFiles)

      // Re-initialize state with new data
      adoptReloadedState(ctx, (prevState) => {
        const newState = createInitialState(
          newFiles,
          newFileTree,
          prevState.source,
          `#${prNumber}: ${newPrInfo.title}`,
          null, // no error
          prevState.session,
          newComments,
          "pr",
          newPrInfo,
          prevState.ignoreMatcher
        )
        const withCommits = { ...newState, commits: newPrInfo.commits ?? [] }
        return restorePosition(withCommits, position)
      })
      ctx.fileFolds.collapse(ctx.getState().ignoredFiles)
      ctx.fileContent.restoreExpanded(position.expandedDividers)
      ctx.visit.begin(watermark, forcePushed)
      followReloadedMarks(ctx, headSha || undefined)

      // Load file statuses
      const localViewedStatuses = await ctx.sources.loadViewedStatuses(state.source)
      ctx.setState((s) =>
        keepTreeHighlight(s, (loading) => {
          const local = loadFileStatuses(loading, localViewedStatuses)
          return viewedStatuses && headSha
            ? updateFileStatuses(
                local,
                mergeGitHubViewedStates(local.fileStatuses, viewedStatuses, headSha, local.allFiles)
              )
            : local
        })
      )
      ctx.fileFolds.collapse(viewedFilenames(ctx.getState()))

      rebuildFeedStream(ctx)

      // Swap in a fresh PR info panel — it caches prInfo/files/comments
      // internally and won't pick up the new data otherwise.
      ctx.recreatePrInfoPanel()

      // Not awaited: the draft only adds to what is already on screen, and
      // `gr` should take no longer for it.
      void loadPendingReview(
        { ...ctx, fetch: ctx.sources.getPendingReview },
        { owner, repo, number: prNumber }
      )
    } else {
      // Local mode - reload diff, commits, and branch info
      const { branchPr } = state
      const [newDiff, newDescription, newBranchInfo, newCommits, newComments, branchReview] = await Promise.all([
        ctx.sources.getLocalDiff(ctx.target),
        ctx.sources.getDiffDescription(ctx.target),
        ctx.sources.getBranchInfo(ctx.target),
        ctx.sources.getLocalCommits(ctx.target),
        ctx.sources.loadComments(state.source),
        branchPr ? ctx.sources.loadBranchPrReview(branchPr) : Promise.resolve([]),
      ])

      const newFiles = sortFiles(parseDiff(newDiff))
      const newFileTree = buildFileTree(newFiles)

      adoptReloadedState(ctx, (prevState) => {
        // The store holds the repo's notes; this diff is about some of them
        // (spec 085).
        const inView = commentsInView(newComments, newFiles, prevState.fileMode)
        const comments = [...inView, ...commentsWithRows(branchReview, newFiles, prevState.fileMode)]
        const newState = createInitialState(newFiles, newFileTree, prevState.source, newDescription, null, prevState.session, comments, "local", null, prevState.ignoreMatcher)

        // Set branch info and commits
        const withBranchAndCommits = {
          ...newState,
          branchInfo: newBranchInfo,
          commits: newCommits,
          // The branch's pull request is asked for once a session (spec 079):
          // a reload that dropped it would never get it back.
          branchPr: prevState.branchPr,
        }

        return restorePosition(withBranchAndCommits, position)
      })
      ctx.fileFolds.collapse(ctx.getState().ignoredFiles)
      ctx.fileContent.restoreExpanded(position.expandedDividers)
      // A local review has no visit, and a PR review loaded without its PR
      // info reloads down this path too: its watermark has nothing left to
      // compare against.
      ctx.visit.reset()
      // No head: in a local review the text alone follows worktree edits.
      followReloadedMarks(ctx, undefined)

      // Viewed marks live on disk, not in the diff — a reload that skipped
      // them would drop every file's review status.
      const localViewedStatuses = await ctx.sources.loadViewedStatuses(state.source)
      ctx.setState((s) =>
        keepTreeHighlight(s, (loading) => loadFileStatuses(loading, localViewedStatuses))
      )
      ctx.fileFolds.collapse(viewedFilenames(ctx.getState()))
    }

    const landed = restoreCursor(ctx, position)
    const { message, type } = refreshMessage(landed, position.anchor, forcePushed)
    ctx.toast.show(message, type)

    ctx.render()
    // After the render: the view has to hold the new rows before the cursor
    // line can be turned into a row to scroll to.
    ctx.revealCursor()

    // Auto-clear toast
    setTimeout(() => {
      ctx.toast.clear()
      ctx.render()
    }, 2000)
  } catch (err) {
    ctx.toast.show(`Refresh failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
    ctx.render()

    setTimeout(() => {
      ctx.toast.clear()
      ctx.render()
    }, 4000)
  }
}

/**
 * After a PR refresh: the feed's events describe the data that was just
 * replaced, so the stream is rebuilt from the new data, from the timeline
 * again when the feed is what the reader is looking at. Its row and filters
 * are the reader's and stay (spec 070).
 */
export function rebuildFeedStream(ctx: Pick<RefreshContext, "getState" | "feed" | "reloadFeed">): void {
  ctx.feed.forgetStream()
  if (ctx.getState().viewMode === "feed") ctx.reloadFeed()
}

/**
 * Swap in the state a reload rebuilt from createInitialState. The help
 * overlay, the confirm dialog, the sync preview, Submit Review, the PR
 * overview's comment prompt, the comment composer's mention and emoji
 * pickers and the file, comments, occurrence, marks and commit pickers,
 * the command palette, the line and blame peeks, and the
 * blame columns, which a reload turns off, live in factories that
 * createInitialState never reaches, so they are closed here, as the rebuild
 * closes every overlay still kept in AppState. The kept comment drafts, the
 * jumplist, GitHub's pending review and the toast live in factories too, and
 * are emptied here, the pending review because a PR refresh fetches the
 * reloaded PR's draft again afterwards, the toast because a refresh shows its
 * outcome only once the rebuild has landed; the expanded context is emptied
 * too, so its files are read again from the reloaded diff's ends, and the
 * caller puts back the runs that were open; the per-commit diffs are emptied,
 * since the reloaded review's commits may not be the ones they were fetched
 * for; the refresh time is stamped, since the review was just confirmed
 * current; the global marks are not emptied, since a mark is followed to its
 * line's new place, and nor is the activity feed, whose row, filters, opened
 * commits and unseen-only are the reader's (a PR refresh drops only its
 * stream), nor the visit, which the caller begins anew on a PR refresh and
 * drops on a local reload.
 */
export function adoptReloadedState(
  ctx: Pick<RefreshContext, "getState" | "setState" | "help" | "confirm" | "syncPreview" | "reviewPreview" | "filePicker" | "commentsPicker" | "occurrencePicker" | "marksPicker" | "commitPicker" | "actionMenu" | "linePeek" | "blamePeek" | "blameColumns" | "commentDrafts" | "composerPickers" | "codePeek" | "jumpList" | "pendingReview" | "toast" | "prCommentInput" | "lastRefresh" | "fileContent" | "commitDiffs">,
  rebuild: (prevState: AppState) => AppState
): void {
  ctx.setState(() => rebuild(ctx.getState()))
  ctx.help.close()
  ctx.confirm.close()
  ctx.syncPreview.close()
  ctx.reviewPreview.close()
  ctx.filePicker.close()
  ctx.commentsPicker.close()
  ctx.occurrencePicker.close()
  ctx.marksPicker.close()
  ctx.commitPicker.close()
  ctx.actionMenu.close()
  ctx.linePeek.close()
  ctx.blamePeek.close()
  ctx.prCommentInput.close()
  ctx.composerPickers.clear()
  ctx.codePeek.close()
  ctx.blameColumns.clear()
  // A draft is keyed by file, line and side, and the reloaded diff can put
  // other code on that line: kept, it would come back on the wrong one.
  ctx.commentDrafts.clear()
  // An entry's anchor names lines in the old diff.
  ctx.jumpList.clear()
  ctx.pendingReview.clear()
  ctx.toast.clear()
  ctx.fileContent.clear()
  ctx.commitDiffs.clear()
  ctx.lastRefresh.stamp()
}

/**
 * Put the cursor back on the row the anchor points at. The search pattern is
 * restored first so that rebuilding the mapping recomputes its matches, and
 * the match the cursor sits on is picked up once it has landed.
 */
function restoreCursor(ctx: RefreshContext, position: RefreshPosition) {
  ctx.setSearchState(restoreSearch(position.search))
  ctx.rebuildLineMapping()

  const { line, landing } = relocate(ctx.getMapping(), position.anchor)
  ctx.setVimState({ ...createCursorState(), line, col: position.anchor?.col ?? 0 })
  ctx.refreshSearchMatches()

  return landing
}
