/**
 * A whole RefreshContext around a small parsed diff, with fake sources, so a
 * test can drive handleRefresh itself and hold any load open while it acts.
 */

import { createInitialState, type AppState } from "../state"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import { buildLineMapping } from "../app/init"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import type { PrInfo } from "../providers/github/types"
import type { Comment } from "../types"
import type { VisitWatermark } from "../utils/visit"
import type { RefreshContext } from "../features/refresh/handlers"
import type { RefreshSources } from "../features/refresh/sources"
import { createHelpState } from "../features/help/state"
import { createConfirmState } from "../features/confirm/state"
import { createSyncPreviewState } from "../features/sync-preview/state"
import { createReviewPreviewState } from "../features/review-preview/state"
import { createPendingReviewState } from "../features/review-preview/pending-state"
import { createToastState } from "../features/toast/state"
import { createLastRefreshState } from "../features/refresh/last-refresh-state"
import { createPrCommentInputState } from "../features/pr-info-panel/comment-input-state"
import { createPrInfoFilterState } from "../features/pr-info-panel/filter-state"
import { createDiffOptionsState } from "../features/diff-view/options-state"
import { createFileContentState } from "../features/file-content/state"
import { createBlockFoldsState } from "../features/folds/block-folds-state"
import { createFileFoldsState } from "../features/folds/file-folds-state"
import { createCommitDiffsState } from "../features/commit-scope/diffs-state"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createActionMenuState } from "../features/action-menu/state"
import { createLinePeekState } from "../features/line-peek/state"
import { createBlamePeekState } from "../features/blame/peek-state"
import { createBlameColumnsState } from "../features/blame/column-state"
import { createCommentDraftsState } from "../features/inline-comment-overlay/drafts-state"
import { createJumpListState } from "../features/jumplist/state"
import { createMarksState } from "../features/marks/state"
import { createFeedState } from "../features/feed/state"
import { createVisitState } from "../features/visit/state"
import { prInfo as prInfoFixture } from "./pr-info"

/** A load the test settles by hand, to act while the refresh awaits it. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export const THREE_TOP_LEVEL_FILES = ["a.ts", "b.ts", "c.ts"]
  .map((name, i) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,1 +1,2 @@
 export const v${i} = ${i}
+export const w${i} = ${i}
`)
  .join("")

export interface RefreshHarnessOptions {
  appMode?: "pr" | "local"
  diff?: string
  /** On screen before the refresh, and what the fake loaders hand back. */
  comments?: Comment[]
  state?: (state: AppState) => AppState
  sources?: Partial<Omit<RefreshSources, "saveVisit">>
}

export function refreshHarness(options: RefreshHarnessOptions = {}) {
  const appMode = options.appMode ?? "pr"
  const diff = options.diff ?? THREE_TOP_LEVEL_FILES
  const comments = options.comments ?? []
  const pr: PrInfo | null = appMode === "pr" ? prInfoFixture("") : null
  const files = sortFiles(parseDiff(diff))
  const source = appMode === "pr" ? "gh:owner/repo#1259" : "local"
  const initial = createInitialState(files, buildFileTree(files), source, "", null, null, comments, appMode, pr)
  let state = options.state ? options.state(initial) : initial

  let vimState = createCursorState()
  let searchState = createSearchState()
  // Held beside the context, as app.ts holds it: the refresh is not handed it.
  const diffOptions = createDiffOptionsState({ wrap: false, alignMarkdownTables: true })
  const fileContent = createFileContentState()
  // Held beside the context, as app.ts holds it: a reload leaves it alone.
  const blockFolds = createBlockFoldsState()
  // A reload only folds more files in it.
  const fileFolds = createFileFoldsState()
  let mapping = buildLineMapping(state, diffOptions, fileContent, blockFolds, fileFolds)
  let headSha = "head-1"

  const calls = {
    saveVisit: [] as { source: string; watermark: VisitWatermark }[],
    forgetStream: 0,
    reloadFeed: 0,
    recreatePrInfoPanel: 0,
  }

  const feed = createFeedState()
  const visit = createVisitState()
  const help = createHelpState()
  const pendingReview = createPendingReviewState()
  const toast = createToastState()
  // Counts its reads, so a test sees how often the refresh stamped it: "0" is the seed.
  let clockReads = 0
  const lastRefresh = createLastRefreshState(() => String(clockReads++))
  const prCommentInput = createPrCommentInputState()
  // Held beside the context, as app.ts holds it: the refresh is not handed it.
  const prInfoFilter = createPrInfoFilterState()

  const sources: RefreshSources = {
    loadPrSession: async () => ({
      prInfo: pr ?? prInfoFixture(""),
      diff,
      comments,
      viewedStatuses: new Map(),
      headSha: "head-2",
    }),
    getLocalDiff: async () => diff,
    getDiffDescription: async () => "",
    getBranchInfo: async () => null,
    getLocalCommits: async () => [],
    loadComments: async () => comments,
    loadViewedStatuses: async () => [],
    getPendingReview: async () => null,
    loadBranchPrReview: async () => [],
    ...options.sources,
    saveVisit: async (savedTo, watermark) => {
      calls.saveVisit.push({ source: savedTo, watermark })
    },
  }

  const ctx: RefreshContext = {
    sources,
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render: () => {},
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getSearchState: () => searchState,
    setSearchState: (s) => { searchState = s },
    getMapping: () => mapping,
    rebuildLineMapping: () => { mapping = buildLineMapping(state, diffOptions, fileContent, blockFolds, fileFolds) },
    revealCursor: () => {},
    refreshSearchMatches: () => {},
    reloadFeed: () => { calls.reloadFeed++ },
    feed: {
      forgetStream: () => {
        calls.forgetStream++
        feed.forgetStream()
      },
    },
    visit,
    getHeadSha: () => headSha,
    setHeadSha: (sha) => { headSha = sha },
    recreatePrInfoPanel: () => { calls.recreatePrInfoPanel++ },
    saveMarks: () => {},
    marks: createMarksState(),
    help,
    confirm: createConfirmState(),
    syncPreview: createSyncPreviewState(),
    reviewPreview: createReviewPreviewState(),
    pendingReview,
    toast,
    lastRefresh,
    prCommentInput,
    fileContent,
    commitDiffs: createCommitDiffsState(),
    fileFolds,
    filePicker: createFilePickerState(),
    commentsPicker: createCommentsPickerState(),
    occurrencePicker: createOccurrencePickerState(),
    marksPicker: createMarksPickerState(),
    commitPicker: createCommitPickerState(),
    actionMenu: createActionMenuState(),
    linePeek: createLinePeekState(),
    blamePeek: createBlamePeekState(),
    blameColumns: createBlameColumnsState(),
    commentDrafts: createCommentDraftsState(),
    jumpList: createJumpListState(),
    target: undefined,
  }

  return { ctx, state: () => state, calls, feed, visit, help, pendingReview, toast, lastRefresh, prCommentInput, prInfoFilter, diffOptions, fileContent, blockFolds, fileFolds, mapping: () => mapping }
}
