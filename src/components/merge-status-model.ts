/**
 * Can this PR merge, gate by gate (spec 108).
 *
 * `mergeReading` gives the header one word for whose move it is, and stops at
 * the first answer: an open thread hides the red build behind it. This model
 * lists every gate GitHub applies — checks, reviews, conversations, conflicts,
 * the base, and whatever else blocks — so nothing hides behind the first
 * answer, and the verdict is only the worst of them.
 */

import type { PrCheck, PrInfo } from "../providers/github/types"
import type { Comment } from "../types"
import { theme } from "../theme"
import { latestReviewStates } from "./pr-info-header"

type MergePointState = "ok" | "warn" | "fail" | "pending" | "info"

export interface MergePoint {
  id: "checks" | "reviews" | "conversations" | "conflicts" | "base" | "blockers"
  state: MergePointState
  text: string
}

export interface MergeStatus {
  verdict: "ready" | "warnings" | "blocked"
  verdictText: "✓ ready" | "⚠ mergeable with warnings" | "✗ blocked"
  points: MergePoint[]
  /** What the conversations line counts, and the rows it opens onto. */
  threads: readonly Comment[]
}

const POINT_STYLES: Record<MergePointState, { icon: string; fg: string }> = {
  ok: { icon: "✓", fg: theme.green },
  warn: { icon: "⚠", fg: theme.yellow },
  fail: { icon: "✗", fg: theme.red },
  pending: { icon: "○", fg: theme.overlay0 },
  info: { icon: "ℹ", fg: theme.blue },
}

export function pointStyle(state: MergePointState): { icon: string; fg: string } {
  return POINT_STYLES[state]
}

export function mergeStatus({
  prInfo,
  comments,
  behindBy,
}: {
  prInfo: PrInfo
  comments: readonly Comment[]
  behindBy: number | null
}): MergeStatus {
  const checks = prInfo.checks ?? []
  const threads = unresolvedThreads(comments)
  const unresolved = threads.length
  const reviews = reviewsPoint(prInfo)
  // BLOCKED is GitHub refusing the merge outright, so riff never reads it as
  // anything milder than blocked, whatever the lines below make of it.
  const refused = prInfo.mergeStateStatus === "BLOCKED"
  const points = [
    checksPoint(checks),
    reviews,
    conversationsPoint(unresolved, { refused }),
    conflictsPoint(prInfo),
    basePoint(prInfo, behindBy),
    ...blockerPoints(prInfo, {
      specificReason: requiredChecksHold(checks) || reviews.state === "fail" || unresolved > 0,
    }),
  ]

  if (refused || points.some((p) => p.state === "fail")) {
    return { verdict: "blocked", verdictText: "✗ blocked", points, threads }
  }
  if (points.some((p) => p.state === "warn" || p.state === "pending") || prInfo.mergeStateStatus === "UNSTABLE") {
    return { verdict: "warnings", verdictText: "⚠ mergeable with warnings", points, threads }
  }
  return { verdict: "ready", verdictText: "✓ ready", points, threads }
}

/**
 * The roots of the threads GitHub still holds open, in the order the diff
 * reads. A local thread has no resolution of its own, so it is never counted.
 */
function unresolvedThreads(comments: readonly Comment[]): Comment[] {
  return comments
    .filter((c) => !c.inReplyTo && c.isThreadResolved === false)
    .sort((a, b) => a.filename.localeCompare(b.filename) || (a.line ?? 0) - (b.line ?? 0))
}

function passed(check: PrCheck): boolean {
  return (
    check.status === "completed" &&
    (check.conclusion === "success" || check.conclusion === "neutral" || check.conclusion === "skipped")
  )
}

function failing(check: PrCheck): boolean {
  return check.status === "completed" && !passed(check)
}

/** With no answer from GitHub on any check, every check has to be taken as one that gates. */
function gates(check: PrCheck, checks: readonly PrCheck[]): boolean {
  return check.isRequired === true || checks.every((c) => c.isRequired === undefined)
}

function requiredChecksHold(checks: readonly PrCheck[]): boolean {
  return checks.some((c) => (failing(c) || c.status !== "completed") && gates(c, checks))
}

function checksPoint(checks: readonly PrCheck[]): MergePoint {
  if (checks.length === 0) return { id: "checks", state: "ok", text: "no checks" }
  const score = `${checks.filter(passed).length}/${checks.length}`

  const failed = checks.filter(failing)
  if (failed.length > 0) {
    const required = failed.filter((c) => gates(c, checks))
    const named = [...required, ...failed.filter((c) => !gates(c, checks))]
    const names = named.slice(0, 2).map((c) => c.name).join(", ")
    const rest = named.length > 2 ? ` +${named.length - 2}` : ""
    const text = `${score} · ${names}${rest} failing`
    return required.length > 0
      ? { id: "checks", state: "fail", text }
      : { id: "checks", state: "warn", text: `${text} (optional)` }
  }

  const running = checks.filter((c) => c.status !== "completed").length
  if (running > 0) return { id: "checks", state: "pending", text: `${score} · ${running} running` }
  return { id: "checks", state: "ok", text: `${score} passed` }
}

function reviewsPoint(prInfo: PrInfo): MergePoint {
  const latest = [...latestReviewStates(prInfo.reviews ?? [])]
  const approvals = latest.filter(([, state]) => state === "APPROVED").length
  const changesBy = latest.filter(([, state]) => state === "CHANGES_REQUESTED").map(([author]) => author)
  // A rule that asks for a PR but zero approvals asks for no approvals.
  const required = prInfo.requiredApprovals || null
  const waitingOn = prInfo.requestedReviewers ?? []

  let text = required === null
    ? `${approvals} ${plural(approvals, "approval")}`
    : `${approvals}/${required} ${plural(Math.max(approvals, required), "approval")}`
  if (changesBy.length > 0) text += ` · changes requested by ${changesBy.join(", ")}`
  if (waitingOn.length > 0) text += ` · waiting on ${waitingOn.join(", ")}`

  const fails =
    changesBy.length > 0 ||
    prInfo.reviewDecision === "CHANGES_REQUESTED" ||
    prInfo.reviewDecision === "REVIEW_REQUIRED" ||
    // GitHub's own APPROVED outranks riff's count, which can fall short of a
    // ruleset's (bot reviewers, reviews past the first page).
    (required !== null && approvals < required && prInfo.reviewDecision !== "APPROVED")
  return { id: "reviews", state: fails ? "fail" : "ok", text }
}

function conversationsPoint(unresolved: number, { refused }: { refused: boolean }): MergePoint {
  if (unresolved === 0) return { id: "conversations", state: "ok", text: "all resolved" }
  // Under BLOCKED an open thread is taken as GitHub's reason (resolved
  // conversations required), so the line that explains the verdict fails.
  return { id: "conversations", state: refused ? "fail" : "warn", text: `${unresolved} unresolved` }
}

function conflictsPoint(prInfo: PrInfo): MergePoint {
  if (prInfo.mergeable === "CONFLICTING" || prInfo.mergeStateStatus === "DIRTY") {
    return { id: "conflicts", state: "fail", text: "conflicting" }
  }
  if (prInfo.mergeable !== "MERGEABLE") return { id: "conflicts", state: "pending", text: "checking" }
  return { id: "conflicts", state: "ok", text: "no conflicts" }
}

function basePoint(prInfo: PrInfo, behindBy: number | null): MergePoint {
  const base = prInfo.baseRef
  // BEHIND is GitHub saying the branch protection wants the head up to date;
  // without it, being behind is only worth knowing.
  const mustBeCurrent = prInfo.mergeStateStatus === "BEHIND"
  if (behindBy === 0) return { id: "base", state: "ok", text: `up to date with ${base}` }
  if (behindBy !== null) {
    return {
      id: "base",
      state: mustBeCurrent ? "fail" : "warn",
      text: `${behindBy} ${plural(behindBy, "commit")} behind ${base}`,
    }
  }
  if (mustBeCurrent) return { id: "base", state: "fail", text: `behind ${base}` }
  return { id: "base", state: "pending", text: `comparing with ${base}` }
}

function blockerPoints(prInfo: PrInfo, { specificReason }: { specificReason: boolean }): MergePoint[] {
  const points: MergePoint[] = []
  if (prInfo.isDraft) points.push({ id: "blockers", state: "fail", text: "draft" })
  // BLOCKED is GitHub's catch-all; it only earns a line of its own when no
  // gate above already explains it.
  if (prInfo.mergeStateStatus === "BLOCKED" && !specificReason) {
    points.push({ id: "blockers", state: "fail", text: "blocked by branch protection" })
  }
  if (prInfo.mergeStateStatus === "UNKNOWN") {
    points.push({ id: "blockers", state: "pending", text: "GitHub is still computing the merge state" })
  }
  if (prInfo.autoMergeMethod) {
    points.push({ id: "blockers", state: "info", text: `auto-merge armed (${prInfo.autoMergeMethod})` })
  }
  return points.length > 0 ? points : [{ id: "blockers", state: "ok", text: "none" }]
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}
