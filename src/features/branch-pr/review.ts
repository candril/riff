/**
 * The review on the branch's pull request, as riff last stored it (spec 094).
 */

import type { BranchPr } from "../../providers/current-pr"
import type { Comment } from "../../types"
import { getCurrentRepo } from "../../providers/github/exec"
import { loadComments } from "../../storage/comments"

export interface BranchPrReviewDeps {
  getCurrentRepo: typeof getCurrentRepo
  loadComments: typeof loadComments
}

/**
 * Reading what is on disk, never fetching: a local review that opens in a
 * second should not wait on GitHub, and `riff pr` is what says "go and get
 * it". Anchoring is the caller's, against the diff it is about to show.
 */
export async function loadBranchPrReview(
  branchPr: BranchPr,
  deps: BranchPrReviewDeps = { getCurrentRepo, loadComments },
): Promise<Comment[]> {
  try {
    const { owner, repo } = await deps.getCurrentRepo()
    return await deps.loadComments(`gh:${owner}/${repo}#${branchPr.number}`)
  } catch {
    // No review on disk, or a repo riff cannot name. The local comments
    // are then the whole of it.
    return []
  }
}
