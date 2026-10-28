import type { PrCheck, PrInfo } from "../providers/github/types"
import { theme } from "../theme"
import type { SummarySpan } from "./fit-spans"
import { formatEta, positionText } from "./merge-queue"
import { failingChecks, pointStyle, type MergePoint, type MergeStatus } from "./merge-status-model"

const VERDICT_STATES = { ready: "ok", warnings: "warn", blocked: "fail" } as const

function verdictSpan(status: MergeStatus): SummarySpan {
  return { text: status.verdictText, fg: pointStyle(VERDICT_STATES[status.verdict]).fg }
}

/**
 * While the PR sits in the merge queue the queue owns the merge, so the
 * header says where it stands there and nothing else: `⧗ queued #3 of 7 · ~12m`.
 */
function queuedSpan(status: MergeStatus): SummarySpan | null {
  const queue = status.queue
  if (!queue || queue.state === "UNMERGEABLE") return null
  const eta = queue.etaSeconds === null ? "" : ` · ${formatEta(queue.etaSeconds)}`
  const { fg } = pointStyle(queue.state === "MERGEABLE" ? "merging" : "queued")
  return { text: `⧗ queued ${positionText(queue)}${eta}`, fg }
}

/** What an open Merge status header says: the verdict, or the queue's word while it holds the PR. */
export function openMergeSummary(status: MergeStatus): SummarySpan[] {
  return [queuedSpan(status) ?? verdictSpan(status)]
}

/**
 * What a folded Merge status header says (spec 108): the verdict, and when
 * it is not ready, what holds it, gate by gate in the section's order, each
 * in its line's colour. Only short names go up here; the lists stay in the
 * section.
 */
export function mergeHeaderSummary(status: MergeStatus, prInfo: Pick<PrInfo, "checks" | "mergeStateStatus">): SummarySpan[] {
  const checks = prInfo.checks ?? []
  const queued = queuedSpan(status)
  if (queued) return [queued]
  const verdict = verdictSpan(status)
  if (status.verdict === "ready") return [verdict]
  const reasons = status.points.flatMap((point) => reasonsFor(point, checks))
  // GitHub's UNSTABLE alone makes the verdict a warning, so with every line
  // fine it is the only reason there is to name.
  if (reasons.length === 0 && prInfo.mergeStateStatus === "UNSTABLE") {
    reasons.push({ text: "unstable", fg: pointStyle("warn").fg })
  }
  return [verdict, ...reasons.flatMap((reason) => [{ text: " · ", fg: theme.subtext0 }, reason])]
}

function reasonsFor(point: MergePoint, checks: readonly PrCheck[]): SummarySpan[] {
  const fg = pointStyle(point.state).fg
  const holds = point.state === "fail" || point.state === "warn"
  switch (point.id) {
    case "checks": {
      const failed = failingChecks(checks)
      const pending = checks.filter((c) => c.status !== "completed").length
      return [
        ...(holds && failed.length > 0 ? [{ text: failingNames(failed), fg }] : []),
        ...(pending > 0 ? [{ text: `⧗ ${pending} pending`, fg: pointStyle("pending").fg }] : []),
      ]
    }
    case "reviews":
      return holds ? [{ text: reviewReason(point.text), fg }] : []
    case "conversations":
      return holds ? [{ text: point.text, fg }] : []
    case "conflicts":
      if (point.state === "pending") return [{ text: "checking conflicts", fg }]
      return holds ? [{ text: "conflicts", fg }] : []
    case "base":
      if (point.state === "pending") return [{ text: point.text, fg }]
      return holds ? [{ text: point.text.slice(point.text.indexOf("behind ")), fg }] : []
    case "queue":
      if (point.state !== "fail") return []
      return [{ text: point.text.startsWith("removed") ? "removed from queue" : "unmergeable in queue", fg }]
    case "blockers": {
      const reason = BLOCKER_REASONS[point.text]
      return reason && (holds || point.state === "pending") ? [{ text: reason, fg }] : []
    }
  }
}

const BLOCKER_REASONS: Record<string, string> = {
  draft: "draft",
  "blocked by branch protection": "branch protection",
  "GitHub is still computing the merge state": "computing",
}

/**
 * The reviews line's text is `1/2 approvals · changes requested by bob ·
 * waiting on carol`; a failing one fails on the change request first, then
 * on approvals short of the rule, and otherwise on GitHub requiring a review.
 */
function reviewReason(text: string): string {
  if (text.includes("changes requested")) return "changes requested"
  const short = /^(\d+)\/(\d+) approvals?/.exec(text)
  if (short && Number(short[1]) < Number(short[2])) return short[0]
  return "review required"
}

/** Two names at most, so a long list never crowds the header: `lint, e2e failing +3`. */
function failingNames(failed: readonly PrCheck[]): string {
  const names = failed.slice(0, 2).map((c) => c.name).join(", ")
  return failed.length > 2 ? `${names} failing +${failed.length - 2}` : `${names} failing`
}
