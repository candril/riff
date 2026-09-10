/**
 * The activity feed's events (spec 070).
 *
 * The overview says what a PR *is*. What *happened* — and what happened
 * since you left — had no home: the conversation knows about comments and
 * nothing else, so commits, approvals, resolutions, checks turning green and
 * force-pushes were invisible without opening a browser.
 *
 * Events come from three places riff already talks to, merged by time:
 * GitHub's timeline (the only source that reports a force-push at all), the
 * check runs, and the review comments riff has anyway.
 */

import type { Comment } from "../types"
import type { PrCheck, PrCommit, PrInfo } from "../providers/github"

export type FeedEventType =
  | "commit"
  | "comment"
  | "review"
  | "check"
  | "push"
  | "ready"

/** The filters the letters toggle. "resolved" is a slice of the comments. */
export type FeedFilterType = FeedEventType | "resolved"

export interface FeedEvent {
  id: string
  type: FeedEventType
  /** When it happened. The feed is newest first. */
  at: string
  /** Who did it, where one person did. Checks have no one. */
  actor?: string
  /** What the row is about, ahead of its words: a file:line, a sha. */
  lead?: string
  /** The row's own words — "approved", "fix: handle empty hunks". */
  title: string
  /** A dim aside after the words — a review's summary line. */
  note?: string
  /** The one thing that sits at the right edge: a check's result. */
  trailing?: string
  /**
   * The thread this comment is in has been resolved. A mark on the row
   * rather than an event of its own: GitHub's timeline does not say when a
   * thread was resolved, and a row needs a time that is true.
   */
  resolved?: boolean
  /** What `Enter` opens: the comment, the commit, the check. */
  target?: FeedTarget
}

export type FeedTarget =
  | { kind: "comment"; commentId: string }
  | { kind: "commit"; sha: string }
  | { kind: "check"; url: string | null }
  | { kind: "url"; url: string }

/**
 * The filters, in the order the header lists them, each on a letter of its
 * own word. The first letter where it is free; `k` is move-up, so checks go
 * by their other name, and `c` was taken by commits before comments got to
 * it.
 */
export const FEED_TYPES: { key: string; type: FeedFilterType; label: string }[] = [
  { key: "c", type: "commit", label: "commits" },
  { key: "m", type: "comment", label: "comments" },
  { key: "r", type: "review", label: "reviews" },
  { key: "b", type: "check", label: "checks" },
  { key: "t", type: "resolved", label: "resolved" },
  { key: "p", type: "push", label: "pushes" },
]

/**
 * A raw timeline entry, as `GET /issues/{n}/timeline` returns it. Only the
 * handful of events riff shows are read; the rest are ignored rather than
 * typed.
 */
export interface TimelineEntry {
  event?: string
  created_at?: string
  actor?: { login?: string }
  commit_id?: string
  sha?: string
  message?: string
  ref?: string
  state?: string
  submitted_at?: string
  body?: string
  html_url?: string
  user?: { login?: string }
}

/**
 * Turn everything riff knows into one stream, newest first.
 *
 * Timestamps are the only ordering: a commit pushed after a review lands
 * above it whatever order the APIs answered in.
 */
export function buildFeed(input: {
  timeline: readonly TimelineEntry[]
  comments: readonly Comment[]
  checks: readonly PrCheck[]
  commits: readonly PrCommit[]
  prInfo: PrInfo | null
}): FeedEvent[] {
  const events: FeedEvent[] = [
    ...fromTimeline(input.timeline, input.commits),
    ...fromComments(input.comments),
    ...fromChecks(input.checks),
  ]

  const seen = new Set<string>()
  return events
    .filter((event) => {
      if (seen.has(event.id)) return false
      seen.add(event.id)
      return true
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

function fromTimeline(
  timeline: readonly TimelineEntry[],
  commits: readonly PrCommit[]
): FeedEvent[] {
  const events: FeedEvent[] = []
  const commitBySha = new Map(commits.map((commit) => [commit.sha, commit]))

  for (const entry of timeline) {
    const at = entry.created_at ?? entry.submitted_at
    const actor = entry.actor?.login ?? entry.user?.login

    switch (entry.event) {
      case "committed": {
        const sha = (entry.sha ?? entry.commit_id ?? "").slice(0, 7)
        if (!sha) break
        const known = commitBySha.get(sha)
        events.push({
          id: `commit:${sha}`,
          type: "commit",
          at: at ?? known?.date ?? "",
          actor: known?.author ?? actor,
          lead: sha,
          title: known?.message ?? firstLine(entry.message ?? sha),
          target: { kind: "commit", sha },
        })
        break
      }
      case "reviewed": {
        if (!at) break
        events.push({
          id: `review:${at}:${actor ?? ""}`,
          type: "review",
          at,
          actor,
          title: reviewVerb(entry.state),
          note: entry.body ? firstLine(entry.body) : undefined,
          target: entry.html_url ? { kind: "url", url: entry.html_url } : undefined,
        })
        break
      }
      case "head_ref_force_pushed": {
        if (!at) break
        events.push({
          id: `push:${at}`,
          type: "push",
          at,
          actor,
          title: "force-pushed",
        })
        break
      }
      case "ready_for_review": {
        if (!at) break
        events.push({ id: `ready:${at}`, type: "ready", at, actor, title: "ready for review" })
        break
      }
      case "head_ref_restored":
      case "head_ref_deleted": {
        if (!at) break
        events.push({
          id: `${entry.event}:${at}`,
          type: "push",
          at,
          actor,
          title: entry.event === "head_ref_deleted" ? "branch deleted" : "branch restored",
          note: entry.ref,
        })
        break
      }
    }
  }

  return events
}

function fromComments(comments: readonly Comment[]): FeedEvent[] {
  // Resolution lives on the root; every reply in the thread inherits it.
  const resolvedRoots = new Set(
    comments.filter((c) => !c.inReplyTo && c.isThreadResolved).map((c) => c.id)
  )
  return comments.map((comment) => ({
    id: `comment:${comment.id}`,
    type: "comment" as const,
    at: comment.createdAt,
    actor: comment.author ?? "you",
    lead: `${comment.filename}:${comment.line}`,
    title: firstLine(comment.body),
    resolved: resolvedRoots.has(comment.inReplyTo ?? comment.id),
    target: { kind: "comment" as const, commentId: comment.id },
  }))
}

function fromChecks(checks: readonly PrCheck[]): FeedEvent[] {
  return checks
    .filter((check) => check.completedAt || check.startedAt)
    .map((check) => ({
      id: `check:${check.id}`,
      type: "check" as const,
      at: check.completedAt ?? check.startedAt ?? "",
      title: check.name,
      trailing: checkResult(check),
      target: { kind: "check" as const, url: check.detailsUrl },
    }))
}

function checkResult(check: PrCheck): string {
  if (check.status !== "completed") return check.status === "queued" ? "queued" : "running"
  switch (check.conclusion) {
    case "success":
      return "✓ passing"
    case null:
      return "done"
    default:
      return `✗ ${check.conclusion}`
  }
}

function reviewVerb(state: string | undefined): string {
  switch (state?.toUpperCase()) {
    case "APPROVED":
      return "approved"
    case "CHANGES_REQUESTED":
      return "requested changes"
    case "DISMISSED":
      return "review dismissed"
    default:
      return "commented"
  }
}

function firstLine(text: string): string {
  const line = text.split("\n").find((candidate) => candidate.trim().length > 0) ?? ""
  return line.trim()
}

/**
 * What the feed shows right now: the types that are on, narrowed by the
 * text filter, and by "unseen" when that is asked for.
 */
export function visibleFeed(
  events: readonly FeedEvent[],
  options: { types: ReadonlySet<string>; filter: string; unseenIds?: ReadonlySet<string> }
): FeedEvent[] {
  const needle = options.filter.toLowerCase()
  return events.filter((event) => {
    if (options.types.size > 0) {
      const wanted =
        options.types.has(event.type) || (options.types.has("resolved") && event.resolved === true)
      if (!wanted) return false
    }
    if (options.unseenIds && !isUnseenEvent(event, options.unseenIds)) return false
    if (!needle) return true
    return [event.lead, event.title, event.note, event.trailing, event.actor]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle)
  })
}

function isUnseenEvent(event: FeedEvent, unseenIds: ReadonlySet<string>): boolean {
  return event.target?.kind === "comment" && unseenIds.has(event.target.commentId)
}
