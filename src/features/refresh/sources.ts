/**
 * What a refresh reads from gh, git and riff's own storage, and the one write
 * it makes there. Passed in rather than imported so a test can hold a load
 * open and act while the refresh awaits it.
 */

import { loadPrSession } from "../../providers/github/session"
import { getPendingReview } from "../../providers/github/review"
import { getLocalDiff, getDiffDescription, getBranchInfo, getLocalCommits } from "../../providers/local"
import { loadComments } from "../../storage/comments"
import { loadViewedStatuses, saveVisit } from "../../storage/caches"
import { loadBranchPrReview } from "../branch-pr/review"

export interface RefreshSources {
  loadPrSession: typeof loadPrSession
  getLocalDiff: typeof getLocalDiff
  getDiffDescription: typeof getDiffDescription
  getBranchInfo: typeof getBranchInfo
  getLocalCommits: typeof getLocalCommits
  loadComments: typeof loadComments
  loadViewedStatuses: typeof loadViewedStatuses
  saveVisit: typeof saveVisit
  getPendingReview: typeof getPendingReview
  loadBranchPrReview: typeof loadBranchPrReview
}

export const liveRefreshSources: RefreshSources = {
  loadPrSession,
  getLocalDiff,
  getDiffDescription,
  getBranchInfo,
  getLocalCommits,
  loadComments,
  loadViewedStatuses,
  saveVisit,
  getPendingReview,
  loadBranchPrReview,
}
