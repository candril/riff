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
  /** Whether the head merges into the base without conflicts — UNKNOWN while
   *  GitHub is still working it out after a push. */
  mergeable?: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null
  /** Approvals the base branch demands, null when GitHub does not say: branch
   *  protection is only readable to admins, so for everyone else this comes
   *  from rulesets alone. */
  requiredApprovals?: number | null
  /** Where the PR stands in its base branch's merge queue; null or absent
   *  when the base has none. */
  mergeQueue?: PrMergeQueue | null
  /** The merge methods the repository allows, in the order GitHub's merge button lists them. */
  mergeMethods?: MergeMethod[]
  /** GitHub's pick for this viewer: the method they last used here, else the repository's default. */
  defaultMergeMethod?: MergeMethod | null
  /** When on, GitHub deletes the head branch itself once the PR merges. */
  deleteBranchOnMerge?: boolean
  /** Whether the viewer may merge past the base's branch protection. */
  viewerCanMergeAsAdmin?: boolean
  /** Whether the repository lets a PR arm auto-merge; absent when the query did not ask. */
  autoMergeAllowed?: boolean
  /** The PR's GraphQL node id, needed only to dequeue it, which gh has no command for. */
  nodeId?: string
  // Extended info (loaded separately)
  commits?: PrCommit[]
  reviews?: PrReview[]
  requestedReviewers?: string[]
  conversationComments?: PrConversationComment[]
  checks?: PrCheck[]
  bodyReactions?: ReactionSummary[]
}

export const MERGE_METHODS = ["squash", "merge", "rebase"] as const
export type MergeMethod = (typeof MERGE_METHODS)[number]

export interface PrMergeQueue {
  entry: PrMergeQueueEntry | null
  /** GitHub can say the PR is queued and still hand back no entry. */
  inQueue: boolean
  /** Only while the PR is out of the queue and its latest queue event is a removal. */
  removal: { reason: string; at: string } | null
}

export interface PrMergeQueueEntry {
  /** 1-based: the head of a live queue reads 1. */
  position: number
  total: number | null
  state: "QUEUED" | "AWAITING_CHECKS" | "MERGEABLE" | "UNMERGEABLE" | "LOCKED"
  etaSeconds: number | null
  enqueuedAt: string | null
  enqueuer: string | null
}

/** How a PR's head sits against its base, as GitHub reports it. */
type MergeStateStatus =
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
  /** Whether branch protection or a ruleset makes this check gate the merge;
   *  absent where GitHub was not asked. */
  isRequired?: boolean
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
interface PendingReviewComment {
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
