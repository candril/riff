/**
 * Whose move is it? (the header's one-word answer to "can this land")
 *
 * GitHub answers the question in three fields that each tell part of it —
 * `mergeStateStatus`, `reviewDecision`, auto-merge — and none of them knows
 * that this team blocks by commenting rather than by requesting changes.
 * The rules here are presto's, read the same way: nothing GitHub says about
 * a draft is trustworthy, an open thread is the author's move before any
 * merge-state reading, and a red build belongs to the author too.
 */

import type { PrCheck, PrInfo } from "../providers/github"
import type { Comment } from "../types"

export type MergeVerdict =
  | "ready"
  | "author"
  | "others"
  | "machine"
  | "auto-merge"
  | "draft"

export interface MergeReading {
  verdict: MergeVerdict
  /** Short enough for the header. */
  text: string
}

export function mergeReading(
  pr: Pick<PrInfo, "isDraft" | "mergeStateStatus" | "reviewDecision" | "autoMergeMethod" | "baseRef">,
  checks: readonly PrCheck[],
  comments: readonly Comment[]
): MergeReading {
  if (pr.isDraft) return { verdict: "draft", text: "draft" }
  if (pr.autoMergeMethod) return { verdict: "auto-merge", text: `auto-merge (${pr.autoMergeMethod})` }

  const open = comments.filter((c) => !c.inReplyTo && c.isThreadResolved === false).length
  if (open > 0) {
    return { verdict: "author", text: `${open} open thread${open === 1 ? "" : "s"}` }
  }

  const state = pr.mergeStateStatus ?? null
  if (state === "CLEAN" || state === "HAS_HOOKS") return { verdict: "ready", text: "mergeable" }
  // Only a non-required check is red; GitHub still offers the merge, and the
  // checks summary beside this carries the warning.
  if (state === "UNSTABLE") return { verdict: "ready", text: "mergeable" }

  if (state === "DIRTY") return { verdict: "author", text: "conflicts" }
  if (state === "BEHIND") return { verdict: "author", text: `behind ${pr.baseRef}` }
  if (pr.reviewDecision === "CHANGES_REQUESTED") return { verdict: "author", text: "changes requested" }

  const check = checkState(checks)
  if (check === "failing") return { verdict: "author", text: "checks failing" }

  // An outstanding review outranks running CI: the review is the bottleneck
  // a human can clear now, and CI finishes on its own either way.
  if (pr.reviewDecision === "REVIEW_REQUIRED") return { verdict: "others", text: "needs review" }

  if (check === "pending") return { verdict: "machine", text: "checks running" }
  if (check === "none" || state === "UNKNOWN" || state === null) {
    return { verdict: "machine", text: "waiting for GitHub" }
  }

  // Blocked, reviewed, green: something unnamed gates it — a required
  // deployment, a CODEOWNER. Someone else's move, just not a named one.
  return { verdict: "others", text: "blocked" }
}

function checkState(checks: readonly PrCheck[]): "failing" | "pending" | "passing" | "none" {
  if (checks.length === 0) return "none"
  let pending = false
  for (const check of checks) {
    if (check.status !== "completed") {
      pending = true
      continue
    }
    switch (check.conclusion) {
      case "failure":
      case "timed_out":
      case "cancelled":
      case "action_required":
        return "failing"
    }
  }
  return pending ? "pending" : "passing"
}
