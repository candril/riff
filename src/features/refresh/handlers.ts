/**
 * Refresh feature handlers
 *
 * Full reload of PR data, diff, and comments from scratch — carrying the
 * reader's position across it (spec 063).
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github/types"
import type { AppMode } from "../../types"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { SearchState } from "../../vim-diff/search-state"
import type { IgnoreMatcher } from "../../utils/ignore"
import {
  showToast,
  clearToast,
  createInitialState,
  collapseResolvedThreads,
  loadFileStatuses,
  updateFileStatuses,
  collapseViewedFiles,
} from "../../state"
import { loadPrSession, PR_COMMITS_FETCH_LIMIT } from "../../providers/github/session"
import { getLocalDiff, getDiffDescription, getBranchInfo, getLocalCommits } from "../../providers/local"
import { loadComments } from "../../storage/comments"
import { loadViewedStatuses, saveVisit } from "../../storage/caches"
import { mergeGitHubViewedStates } from "../../utils/viewed-status"
import { commentsInView } from "../../utils/notes"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { groupIntoThreads } from "../../utils/threads"
import { markVisit } from "../../utils/visit"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { Mark } from "../marks/types"
import type { HelpState } from "../help/state"
import type { ConfirmState } from "../confirm/state"
import type { SyncPreviewState } from "../sync-preview/state"
import type { ReviewPreviewState } from "../review-preview/state"
import type { RecreatePrInfoPanel } from "../pr-info-panel/rebuild"
import { followReloadedMarks } from "./marks"
import {
  capturePosition,
  refreshMessage,
  rebuildAfterRefresh,
  relocate,
  keepTreeHighlight,
  restoreSearch,
  wasForcePushed,
  type RefreshPosition,
} from "./position"

export interface RefreshContext {
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
  help: Pick<HelpState, "close">
  confirm: Pick<ConfirmState, "close">
  syncPreview: Pick<SyncPreviewState, "close">
  reviewPreview: Pick<ReviewPreviewState, "close">
  // App config (captured from options at init time)
  mode: AppMode
  target: string | undefined
  prInfo: PrInfo | null
}

/**
 * Full refresh - reload everything from scratch (PR data, diff, comments)
 */
export async function handleRefresh(ctx: RefreshContext): Promise<void> {
  const state = ctx.getState()
  const position = capturePosition(state, ctx.getVimState(), ctx.getMapping(), ctx.getSearchState())

  // Show loading toast
  ctx.setState((s) => showToast(s, "Refreshing...", "info"))
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
      } = await loadPrSession(prNumber, owner, repo)

      forcePushed = wasForcePushed(previousHeadSha, newPrInfo.commits ?? [], PR_COMMITS_FETCH_LIMIT)
      ctx.setHeadSha(headSha)

      const visit = markVisit(state.comments, headSha, state.seenCommentIds)
      void saveVisit(state.source, visit)

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
        // Set commits from refreshed PR info, and re-mark the visit: a
        // refresh is a look, so what was on screen up to now has been seen
        // and only what the reload brings is new (spec 069).
        const withCommits = {
          ...newState,
          commits: newPrInfo.commits ?? [],
          visit,
          seenCommentIds: new Set<string>(),
          visitRebased: forcePushed,
        }
        // The feed's events describe the data that was just replaced; its
        // filters and row are the reader's and survive (spec 070).
        return collapseIgnoredFiles(rebuildAfterRefresh(prevState, withCommits, position))
      })
      followReloadedMarks(ctx, headSha || undefined)

      // Collapse resolved threads
      const threads = groupIntoThreads(newComments)
      ctx.setState((s) => collapseResolvedThreads(s, threads))

      // Load file statuses
      const localViewedStatuses = await loadViewedStatuses(state.source)
      ctx.setState((s) =>
        keepTreeHighlight(s, (loading) => {
          const local = loadFileStatuses(loading, localViewedStatuses)
          const merged =
            viewedStatuses && headSha
              ? updateFileStatuses(
                  local,
                  mergeGitHubViewedStates(local.fileStatuses, viewedStatuses, headSha, local.allFiles)
                )
              : local
          return collapseViewedFiles(merged)
        })
      )

      // The stream is rebuilt from the new data — from the timeline again
      // when the feed is what the reader is looking at.
      ctx.setState((s) => ({
        ...s,
        feed: { ...s.feed, events: [], commitFiles: new Map() },
      }))
      if (ctx.getState().viewMode === "feed") ctx.reloadFeed()

      // Swap in a fresh PR info panel — it caches prInfo/files/comments
      // internally and won't pick up the new data otherwise.
      ctx.recreatePrInfoPanel()
    } else {
      // Local mode - reload diff, commits, and branch info
      const [newDiff, newDescription, newBranchInfo, newCommits, newComments] = await Promise.all([
        getLocalDiff(ctx.target),
        getDiffDescription(ctx.target),
        getBranchInfo(ctx.target),
        getLocalCommits(ctx.target),
        loadComments(state.source),
      ])

      const newFiles = sortFiles(parseDiff(newDiff))
      const newFileTree = buildFileTree(newFiles)

      adoptReloadedState(ctx, (prevState) => {
        // The store holds the repo's notes; this diff is about some of them
        // (spec 085).
        const inView = commentsInView(newComments, newFiles, prevState.fileMode)
        const newState = createInitialState(newFiles, newFileTree, prevState.source, newDescription, null, prevState.session, inView, "local", null, prevState.ignoreMatcher)

        // Set branch info and commits
        const withBranchAndCommits = {
          ...newState,
          branchInfo: newBranchInfo,
          commits: newCommits,
        }

        return collapseIgnoredFiles(rebuildAfterRefresh(prevState, withBranchAndCommits, position))
      })
      // No head: in a local review the text alone follows worktree edits.
      followReloadedMarks(ctx, undefined)

      // Viewed marks live on disk, not in the diff — a reload that skipped
      // them would drop every file's review status.
      const threads = groupIntoThreads(ctx.getState().comments)
      ctx.setState((s) => collapseResolvedThreads(s, threads))
      const localViewedStatuses = await loadViewedStatuses(state.source)
      ctx.setState((s) =>
        keepTreeHighlight(s, (loading) => collapseViewedFiles(loadFileStatuses(loading, localViewedStatuses)))
      )
    }

    const landed = restoreCursor(ctx, position)
    const { message, type } = refreshMessage(landed, position.anchor, forcePushed)
    ctx.setState((s) => showToast(s, message, type))

    ctx.render()
    // After the render: the view has to hold the new rows before the cursor
    // line can be turned into a row to scroll to.
    ctx.revealCursor()

    // Auto-clear toast
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 2000)
  } catch (err) {
    ctx.setState((s) =>
      showToast(s, `Refresh failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
    )
    ctx.render()

    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 4000)
  }
}

/**
 * Swap in the state a reload rebuilt from createInitialState. The help
 * overlay, the confirm dialog, the sync preview and Submit Review live in
 * factories that createInitialState never reaches, so they are closed here,
 * as the rebuild closes every overlay still kept in AppState.
 */
export function adoptReloadedState(
  ctx: Pick<RefreshContext, "getState" | "setState" | "help" | "confirm" | "syncPreview" | "reviewPreview">,
  rebuild: (prevState: AppState) => AppState
): void {
  ctx.setState(() => rebuild(ctx.getState()))
  ctx.help.close()
  ctx.confirm.close()
  ctx.syncPreview.close()
  ctx.reviewPreview.close()
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

function collapseIgnoredFiles(state: AppState): AppState {
  if (state.ignoredFiles.size === 0) return state

  const collapsedFiles = new Set(state.collapsedFiles)
  for (const filename of state.ignoredFiles) {
    collapsedFiles.add(filename)
  }
  return { ...state, collapsedFiles }
}
