import type { ReactionSummary } from "../../types"

export interface PrInfo {
  number: number
  title: string
  body: string
  author: string
  state: "open" | "closed" | "merged"
  isDraft?: boolean
  headRef: string // Branch name
  baseRef: string // Target branch (e.g., "main")
  /** Owner of the repo the head branch lives in. Differs from `owner` for
   *  fork PRs, where the branch only exists on the fork. */
  headRepoOwner?: string
  /** Name of the repo the head branch lives in (usually same as `repo`). */
  headRepoName?: string
  owner: string
  repo: string
  url: string
  additions: number
  deletions: number
  changedFiles: number
  createdAt?: string
  updatedAt?: string
  /** GitHub's own reading of whether this can merge — UNKNOWN while it is
   *  still computing it, null on the paths that do not ask. */
  mergeStateStatus?: MergeStateStatus | null
  /** GitHub's review decision. Null while approvals stand has been seen on
   *  a live PR, so it is never the only word on reviews. */
  reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null
  /** The method auto-merge is armed with, or null when it is off. */
  autoMergeMethod?: string | null
  // Extended info (loaded separately)
  commits?: PrCommit[]
  reviews?: PrReview[]
  requestedReviewers?: string[]
  conversationComments?: PrConversationComment[]
  checks?: PrCheck[]
  bodyReactions?: ReactionSummary[]
}

/** How a PR's head sits against its base, as GitHub reports it. */
export type MergeStateStatus =
  | "BEHIND"
  | "BLOCKED"
  | "CLEAN"
  | "DIRTY"
  | "DRAFT"
  | "HAS_HOOKS"
  | "UNKNOWN"
  | "UNSTABLE"

export interface PrCommit {
  sha: string        // Short SHA (7 chars)
  message: string    // First line of commit message
  author: string
  date: string       // ISO date
  /** No file changes. Everyday in jj, where the working copy usually is one. */
  empty?: boolean
}

export interface PrReview {
  id: string  // GraphQL ID (PRR_...)
  databaseId?: number  // Numeric REST API ID (matches pull_request_review_id on comments)
  author: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED"
  body?: string  // Review summary comment
  submittedAt?: string
  url?: string
  reactions?: ReactionSummary[]
}

/**
 * A CI check run on a PR
 */
export interface PrCheck {
  id: number
  name: string
  status: "queued" | "in_progress" | "completed"
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | "action_required" | null
  detailsUrl: string | null
  startedAt: string | null
  completedAt: string | null
  // Session-local (spec 043). Populated lazily when the user expands a
  // failed check. Not persisted; not flowed through app state.
  annotations?: PrCheckAnnotation[]
  annotationsStatus?: "idle" | "loading" | "loaded" | "error"
}

/**
 * Structured error/warning entry attached to a check run (spec 043).
 * GitHub Actions auto-produces these from `::error file=…::` workflow
 * commands; third-party tools push them via the Checks API.
 */
export interface PrCheckAnnotation {
  path: string
  startLine: number
  endLine: number
  startColumn?: number
  endColumn?: number
  level: "notice" | "warning" | "failure"
  message: string
  title?: string
  rawDetailsUrl?: string
}

/**
 * A conversation comment on a PR (not attached to code)
 * These are the "issue comments" that appear in the PR conversation tab
 */
export interface PrConversationComment {
  id: number
  body: string
  author: string
  createdAt: string
  updatedAt: string
  url: string
  isBot: boolean
  reactions?: ReactionSummary[]
}

export interface PrComment {
  id: number
  body: string
  path: string
  line: number
  side: "LEFT" | "RIGHT"
  author: string
  createdAt: string
  updatedAt: string
  url: string
  diffHunk?: string // Code context from GitHub

  // Thread info
  inReplyToId?: number
  threadId?: number

  // GraphQL thread info (for resolution)
  graphqlThreadId?: string  // node_id for GraphQL API
  isThreadResolved?: boolean
  // GraphQL `isOutdated` — set on the thread root, inherited by replies in
  // the second pass below.
  isOutdated?: boolean

  // Reactions from GraphQL reactionGroups (spec 042)
  reactions?: ReactionSummary[]
}

/**
 * A pending review comment from GitHub
 */
export interface PendingReviewComment {
  id: number
  body: string
  path: string
  line: number
  side: "LEFT" | "RIGHT"
  inReplyToId?: number
}

/**
 * A pending (draft) review on a PR
 */
export interface PendingReview {
  id: number
  user: string
  body: string
  comments: PendingReviewComment[]
}

/**
 * A file fetch that can say why it failed.
 *
 * Worth a type rather than `string | null`: that collapsed rate limits, auth
 * failures, and genuine 404s into one indistinguishable null, and the
 * rate-limit case is the one that actually strands people. `gh pr view
 * --json` runs on GraphQL, whose quota drains independently of REST, so a
 * healthy `gh api` is no evidence the next call will land.
 */
export type FileContentResult =
  | { ok: true; content: string }
  | { ok: false; error: string }
