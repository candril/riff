/**
 * Creating a pull request for the local review (spec 019): the reader
 * writes it in their editor, gh creates it, and riff swaps onto it. What it
 * reaches out to — the editor, gh, riff's own storage — comes in as sources,
 * so a test can run it with no editor and no gh.
 */

import type { AppState } from "../../state"
import { createInitialState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import { createCursorState } from "../../vim-diff/cursor-state"
import { createSearchState, type SearchState } from "../../vim-diff/search-state"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { openPrCreator } from "../../utils/editor/spawn"
import { createPullRequest } from "../../providers/github/mutations"
import { loadPrSession } from "../../providers/github/session"
import { loadMarks, loadPanelFilters } from "../../storage/caches"
import { followLoadedMarks } from "../marks/load"
import type { GlobalMarksState } from "../marks/state"
import type { ActivityFeedState } from "../feed/state"
import type { VisitState } from "../visit/state"
import type { ToastState } from "../toast/state"
import type { LastRefreshState } from "../refresh/last-refresh-state"
import { closeFeatureOverlays, type AnotherReviewFeatures } from "../refresh/another-review"
import type { FileFoldsState } from "../folds/file-folds-state"

export interface CreatePrSources {
  openPrCreator: typeof openPrCreator
  createPullRequest: typeof createPullRequest
  loadPrSession: typeof loadPrSession
  loadMarks: typeof loadMarks
  followLoadedMarks: typeof followLoadedMarks
  loadPanelFilters: typeof loadPanelFilters
}

export const liveCreatePrSources: CreatePrSources = {
  openPrCreator,
  createPullRequest,
  loadPrSession,
  loadMarks,
  followLoadedMarks,
  loadPanelFilters,
}

export interface CreatePrContext {
  sources: CreatePrSources
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  /** The editor takes the terminal while the reader writes the PR. */
  suspend: () => void
  resume: () => void
  later: (fn: () => void, ms: number) => void
  setVimState: (s: VimCursorState) => void
  setSearchState: (s: SearchState) => void
  setHeadSha: (sha: string) => void
  rebuildLineMapping: () => void
  forgetBaseLookups: () => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  lastRefresh: Pick<LastRefreshState, "stamp">
  globalMarks: Pick<GlobalMarksState, "reset">
  activityFeed: Pick<ActivityFeedState, "reset">
  visit: Pick<VisitState, "reset">
  features: AnotherReviewFeatures
  fileFolds: Pick<FileFoldsState, "collapse">
}

export async function handleCreatePr(ctx: CreatePrContext): Promise<void> {
  const fileSummary = ctx.getState().files.map((f) => {
    const prefix = f.status === "added" ? "A" : f.status === "deleted" ? "D" : f.status === "renamed" ? "R" : "M"
    return `${prefix} ${f.filename}`
  })

  let rawDiff = ""
  for (const f of ctx.getState().files) {
    rawDiff += f.content + "\n"
  }

  let suspended = false
  try {
    ctx.suspend()
    suspended = true

    const result = await ctx.sources.openPrCreator({
      diff: rawDiff,
      fileSummary,
      branchInfo: ctx.getState().branchInfo,
    })

    ctx.resume()
    suspended = false

    if (!result) {
      // An empty title or a failed editor means the reader backed out: nothing goes to GitHub.
      ctx.render()
      return
    }

    ctx.toast.show("Creating PR...", "info")
    ctx.render()

    const { prNumber, url } = await ctx.sources.createPullRequest(result.title, result.body, result.draft)

    ctx.toast.show(`PR #${prNumber} created! Loading...`, "success")
    ctx.render()

    const prSession = await ctx.sources.loadPrSession(prNumber)

    const newFiles = sortFiles(parseDiff(prSession.diff))
    const newFileTree = buildFileTree(newFiles)
    const newSource = `gh:${prSession.prInfo.owner}/${prSession.prInfo.repo}#${prNumber}`
    // Marks belong to the review: the PR's own, or the next `m` would save over them.
    const followed = await ctx.sources.followLoadedMarks(newSource, await ctx.sources.loadMarks(newSource), newFiles, prSession.headSha || undefined)

    ctx.setState((state) => createInitialState(
      newFiles,
      newFileTree,
      newSource,
      `#${prNumber}: ${prSession.prInfo.title}`,
      null,
      state.session,
      prSession.comments,
      "pr",
      prSession.prInfo,
      state.ignoreMatcher
    ))
    ctx.lastRefresh.stamp()
    ctx.toast.clear()
    closeFeatureOverlays(ctx.features)
    ctx.globalMarks.reset(followed)
    ctx.activityFeed.reset()
    ctx.visit.reset()
    // The new PR gets no panel here, so no rebuild forgets the lookups for it.
    ctx.forgetBaseLookups()

    ctx.fileFolds.collapse(ctx.getState().ignoredFiles)
    const panelFilters = await ctx.sources.loadPanelFilters(newSource)
    ctx.setState((state) => ({
      ...state,
      threadPanelOpenOnly: panelFilters.openThreadsOnly,
      treeUnviewedOnly: panelFilters.unviewedFilesOnly,
      treeKeptFile: null,
    }))

    ctx.setVimState(createCursorState())
    ctx.setSearchState(createSearchState())
    ctx.setHeadSha(prSession.headSha)
    ctx.rebuildLineMapping()

    ctx.toast.show(`PR #${prNumber} created: ${url}`, "success")
    ctx.render()
    ctx.later(() => {
      ctx.toast.clear()
      ctx.render()
    }, 4000)
  } catch (err) {
    if (suspended) ctx.resume()
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.toast.show(`Error: ${msg}`, "error")
    ctx.render()
    ctx.later(() => {
      ctx.toast.clear()
      ctx.render()
    }, 3000)
  }
}
