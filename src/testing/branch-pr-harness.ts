/**
 * A local review on a branch with a pull request, with real feature
 * factories around it, for driving the paths that swap riff onto a PR:
 * opening the branch's PR and creating one. Each test adds its own fake
 * sources.
 */

import { createInitialState, type AppState } from "../state"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import { createCursorState } from "../vim-diff/cursor-state"
import type { VimCursorState } from "../vim-diff/types"
import type { BranchPr } from "../providers/current-pr"
import type { loadPrSession } from "../providers/github/session"
import type { getPendingReview } from "../providers/github/review"
import type { LoadPendingReviewContext } from "../features/review-preview/load-pending"
import { createToastState } from "../features/toast/state"
import { createLastRefreshState } from "../features/refresh/last-refresh-state"
import { createMarksState } from "../features/marks/state"
import { createFeedState } from "../features/feed/state"
import { createVisitState } from "../features/visit/state"
import { createAnotherReviewFeatures } from "./another-review-features"
import { THREE_TOP_LEVEL_FILES } from "./refresh-harness"
import { prInfo } from "./pr-info"

export const branchPr: BranchPr = { number: 7, title: "t", state: "OPEN", isDraft: false, url: "u" }

/** What loadPrSession hands back for PR `number` of owner/repo. */
export function prSession(number: number): Awaited<ReturnType<typeof loadPrSession>> {
  return {
    prInfo: prInfo("", { number, title: `PR ${number}` }),
    diff: THREE_TOP_LEVEL_FILES,
    comments: [],
    viewedStatuses: new Map(),
    headSha: `head-of-${number}`,
  }
}

export interface BranchPrHarnessOptions {
  state?: (state: AppState) => AppState
  getPendingReview?: typeof getPendingReview
}

export function branchPrHarness(options: BranchPrHarnessOptions = {}) {
  const files = sortFiles(parseDiff(THREE_TOP_LEVEL_FILES))
  const initial = createInitialState(files, buildFileTree(files), "local", "", null, null, [], "local", null)
  let state: AppState = options.state ? options.state({ ...initial, branchPr }) : { ...initial, branchPr }
  let headSha = "local-head"
  let vimState: VimCursorState = createCursorState()

  const features = createAnotherReviewFeatures()

  const getState = () => state
  const setState = (fn: (s: AppState) => AppState) => { state = fn(state) }
  const render = () => {}

  const pendingReviewLoad: LoadPendingReviewContext = {
    getState,
    setState,
    render,
    pendingReview: features.pendingReview,
    fetch: options.getPendingReview ?? (async () => null),
  }

  /** The fields both paths' contexts take alike. */
  const common = {
    getState,
    setState,
    render,
    setHeadSha: (sha: string) => { headSha = sha },
    setVimState: (s: VimCursorState) => { vimState = s },
    rebuildLineMapping: () => {},
    toast: createToastState(),
    lastRefresh: createLastRefreshState(),
    globalMarks: createMarksState(),
    activityFeed: createFeedState(),
    visit: createVisitState(),
    features,
  }

  return {
    common,
    pendingReviewLoad,
    features,
    state: () => state,
    headSha: () => headSha,
    vimState: () => vimState,
  }
}
