/**
 * Opening the pull request a local review's branch already has (spec 095),
 * in place of the local review. What it reads from gh, git and riff's own
 * storage comes in as sources, so a test can stub them, hold one open, or
 * make one fail.
 */

import type { AppState } from "../../state"
import { createInitialState, loadFileStatuses, collapseViewedFiles } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import { createCursorState } from "../../vim-diff/cursor-state"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { getCurrentRepo } from "../../providers/github/exec"
import { loadPrSession } from "../../providers/github/session"
import { loadOrCreateSession } from "../../storage/session"
import { loadMarks, loadPanelFilters, loadViewedStatuses } from "../../storage/caches"
import { loadInfoSections } from "../../storage/info-sections"
import { followLoadedMarks } from "../marks/load"
import type { GlobalMarksState } from "../marks/state"
import type { ActivityFeedState } from "../feed/state"
import type { VisitState } from "../visit/state"
import type { ToastState } from "../toast/state"
import type { LastRefreshState } from "../refresh/last-refresh-state"
import { closeFeatureOverlays, type AnotherReviewFeatures } from "../refresh/another-review"
import type { RecreatePrInfoPanel } from "../pr-info-panel/rebuild"
import { loadPendingReview, type LoadPendingReviewContext } from "../review-preview/load-pending"

export interface OpenBranchPrSources {
  getCurrentRepo: typeof getCurrentRepo
  loadPrSession: typeof loadPrSession
  loadOrCreateSession: typeof loadOrCreateSession
  loadPanelFilters: typeof loadPanelFilters
  loadInfoSections: typeof loadInfoSections
  loadMarks: typeof loadMarks
  followLoadedMarks: typeof followLoadedMarks
  loadViewedStatuses: typeof loadViewedStatuses
}

export const liveOpenBranchPrSources: OpenBranchPrSources = {
  getCurrentRepo,
  loadPrSession,
  loadOrCreateSession,
  loadPanelFilters,
  loadInfoSections,
  loadMarks,
  followLoadedMarks,
  loadViewedStatuses,
}

export interface OpenBranchPrContext {
  sources: OpenBranchPrSources
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  setHeadSha: (sha: string) => void
  setVimState: (s: VimCursorState) => void
  rebuildLineMapping: () => void
  recreatePrInfoPanel: RecreatePrInfoPanel
  updateFileTreePanel: () => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  lastRefresh: Pick<LastRefreshState, "stamp">
  globalMarks: Pick<GlobalMarksState, "reset">
  activityFeed: Pick<ActivityFeedState, "reset">
  visit: Pick<VisitState, "reset">
  features: AnotherReviewFeatures
  pendingReviewLoad: LoadPendingReviewContext
}

export function createBranchPrOpener(ctx: OpenBranchPrContext): (view: "state" | "feed") => Promise<void> {
  let loadingBranchPr = false

  /**
   * Read the pull request the branch already has (spec 095).
   *
   * riff names it in the header of every local review, and until now that
   * was all it did with it — the overview and the feed are the pull
   * request's surfaces and a local review had none. Asking for one is what
   * fetches it: the same load `riff pr` does, in place.
   */
  return async function openBranchPr(view: "state" | "feed"): Promise<void> {
    const branchPr = ctx.getState().branchPr
    if (!branchPr || ctx.getState().appMode === "pr") return
    if (loadingBranchPr) return
    loadingBranchPr = true

    ctx.toast.show(`Opening #${branchPr.number}…`, "info")
    ctx.render()

    try {
      const { owner, repo } = await ctx.sources.getCurrentRepo()
      const loaded = await ctx.sources.loadPrSession(branchPr.number, owner, repo)
      const source = `gh:${owner}/${repo}#${branchPr.number}`
      const files = sortFiles(parseDiff(loaded.diff))

      ctx.setHeadSha(loaded.headSha)
      const session = await ctx.sources.loadOrCreateSession(source)
      const next = createInitialState(
        files,
        buildFileTree(files),
        source,
        `#${branchPr.number}: ${loaded.prInfo.title}`,
        null,
        session,
        loaded.comments,
        "pr",
        loaded.prInfo,
        ctx.getState().ignoreMatcher,
      )
      // A file riff was told not to show opens folded, the way every other
      // load leaves it.
      const ignored = new Set([...next.ignoredFiles].filter((f) => next.files.some((x) => x.filename === f)))
      const [panelFilters, openSections] = await Promise.all([ctx.sources.loadPanelFilters(source), ctx.sources.loadInfoSections(source)])
      const followed = await ctx.sources.followLoadedMarks(source, await ctx.sources.loadMarks(source), files, loaded.headSha || undefined)
      ctx.setState(() => ({
        ...next,
        collapsedFiles: new Set([...next.collapsedFiles, ...ignored]),
        commits: loaded.prInfo.commits ?? [],
        threadPanelOpenOnly: panelFilters.openThreadsOnly,
        treeUnviewedOnly: panelFilters.unviewedFilesOnly,
        viewMode: view,
      }))
      ctx.lastRefresh.stamp()
      ctx.toast.clear()
      ctx.globalMarks.reset(followed)
      ctx.activityFeed.reset()
      ctx.visit.reset()
      closeFeatureOverlays(ctx.features)
      const opened = ctx.getState()
      const viewed = await ctx.sources.loadViewedStatuses(source)
      ctx.setState(() => collapseViewedFiles(loadFileStatuses(opened, viewed)))

      // A local review has no PR info panel — there was no pull request to
      // build one from — and the overview is that panel. Without this the
      // view switches and there is nothing there to draw, which reads as
      // being stuck on the diff.
      ctx.recreatePrInfoPanel(openSections)

      ctx.rebuildLineMapping()
      ctx.setVimState(createCursorState())
      ctx.updateFileTreePanel()
      ctx.render()
      void loadPendingReview(ctx.pendingReviewLoad, { owner, repo, number: branchPr.number })
    } catch (err) {
      ctx.toast.show(
        `Could not open #${branchPr.number}: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
      )
      ctx.render()
    } finally {
      loadingBranchPr = false
    }
  }
}
