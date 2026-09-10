import { $ } from "bun"
import { saveComment, saveSession, loadComments, deleteCommentFile } from "../storage"
import { getCurrentRepoRef } from "./repo"
import type { Comment, ReviewSession, ReactionContent, ReactionSummary, ReactionTarget } from "../types"
import { REACTION_CONTENT } from "../types"

/** Up to 300 mentionable users — see `getMentionableUsers`. */
/** References resolved per GraphQL call — GitHub caps a query's node count. */
const REFERENCE_BATCH = 25

const MENTIONABLE_PAGES = 3

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract a useful error message from a Bun shell error.
 * Bun's ShellError has stderr which contains the actual error,
 * while message is just "Failed with exit code N".
 */
/**
 * Turn a failed `gh` invocation into something a toast can show.
 *
 * `gh` prints the API's JSON body on **stdout** and only a terse
 * "Validation Failed (HTTP 422)" on stderr, so reading stderr alone loses
 * the one part that says what actually went wrong.
 */
function extractShellError(err: unknown): string {
  if (err && typeof err === "object") {
    const shellErr = err as { stdout?: Buffer; stderr?: Buffer; message?: string }
    const detail = describeApiError(shellErr.stdout) ?? describeApiError(shellErr.stderr)
    if (detail) return detail

    const stderrStr = shellErr.stderr?.toString().trim()
    if (stderrStr) return stderrStr
    if (shellErr.message) return shellErr.message
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * Known GitHub validation failures, phrased as something the user can act on.
 * Matched on the API's own wording; anything unrecognised passes through.
 */
const API_ERROR_HINTS: { match: RegExp; hint: string }[] = [
  {
    match: /line.*could not be resolved|could not be resolved.*line/i,
    hint: "GitHub can't anchor a comment there — the line is outside the diff",
  },
  {
    match: /one pending review per pull request/i,
    hint: "You already have an unsubmitted review on GitHub — submit or discard it first",
  },
  {
    match: /commit_id.*not.*part of the pull request|no commit found/i,
    hint: "The PR has moved on — refresh (gr) and try again",
  },
]

function describeApiError(buf?: Buffer): string | null {
  if (!buf) return null
  const jsonMatch = buf.toString().match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      message?: string
      errors?: { message?: string; field?: string }[]
    }
    const specific = (parsed.errors ?? [])
      .map((e) => (e.field && e.message ? `${e.field} ${e.message}` : e.message))
      .filter((m): m is string => Boolean(m))

    const raw = specific.length > 0 ? specific.join("; ") : parsed.message
    if (!raw) return null

    return API_ERROR_HINTS.find((h) => h.match.test(raw))?.hint ?? raw
  } catch {
    return null
  }
}


// ============================================================================
// Types
// ============================================================================

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
  // Extended info (loaded separately)
  commits?: PrCommit[]
  reviews?: PrReview[]
  requestedReviewers?: string[]
  conversationComments?: PrConversationComment[]
  checks?: PrCheck[]
  bodyReactions?: ReactionSummary[]
}

export interface PrCommit {
  sha: string        // Short SHA (7 chars)
  message: string    // First line of commit message
  author: string
  date: string       // ISO date
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

// ============================================================================
// Error handling
// ============================================================================

/**
 * Wrap gh CLI commands with user-friendly error messages
 */
async function safeGhCommand<T>(cmd: () => Promise<T>): Promise<T> {
  try {
    return await cmd()
  } catch (error) {
    const msg = String(error)

    if (msg.includes("gh auth login")) {
      throw new Error("Not logged in to GitHub. Run: gh auth login")
    }
    if (msg.includes("Could not resolve")) {
      throw new Error("PR not found. Check the PR number and repository.")
    }
    if (msg.includes("not a git repository")) {
      throw new Error("Not in a git repository. Specify full repo: riff gh:owner/repo#123")
    }

    throw error
  }
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

/**
 * Explain a failed `gh` call in terms the user can act on, for the paths
 * that surface straight into a toast.
 */
async function describeGhFailure(error: unknown): Promise<string> {
  const text = extractShellError(error)

  if (/rate limit/i.test(text)) {
    const resetAt = await rateLimitResetTime()
    return resetAt
      ? `GitHub API rate limit exceeded — resets at ${resetAt}`
      : "GitHub API rate limit exceeded"
  }
  if (/gh auth login/i.test(text)) {
    return "Not logged in to GitHub — run: gh auth login"
  }
  if (/\b404\b|not found/i.test(text)) {
    return "Not on GitHub at this revision"
  }

  return text.split("\n").find((line) => line.trim())?.trim() || "Unknown error"
}

/**
 * When the soonest-exhausted quota comes back, as a local clock time.
 * "Try again later" is useless without a number, and `gh api rate_limit` is
 * itself unmetered so asking costs nothing.
 */
async function rateLimitResetTime(): Promise<string | null> {
  const result = await $`gh api rate_limit`.quiet().nothrow()
  if (result.exitCode !== 0) return null

  try {
    const resources = JSON.parse(result.stdout.toString()).resources as Record<
      string,
      { remaining: number; reset: number }
    >
    // GraphQL and REST reset on separate clocks; the earliest exhausted one
    // is the honest answer to "when can I retry".
    const resets = Object.values(resources)
      .filter((r) => r.remaining === 0)
      .map((r) => r.reset)
    if (resets.length === 0) return null
    return new Date(Math.min(...resets) * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return null
  }
}

// ============================================================================
// GitHub API functions
// ============================================================================

/**
 * Get current repo's owner and name from gh CLI
 */
export async function getCurrentRepo(): Promise<{ owner: string; repo: string }> {
  const ref = await getCurrentRepoRef()
  if (!ref) {
    throw new Error("Not in a git repository. Specify full repo: riff gh:owner/repo#123")
  }
  return ref
}

/**
 * Get current GitHub username
 */
export async function getCurrentUser(): Promise<string> {
  try {
    const result = await $`gh api user --jq .login`.text()
    return result.trim()
  } catch {
    return "@you"
  }
}

/**
 * Fetch annotations for a single check run (spec 043). Capped at 100
 * entries post-filter so a pathological build can't balloon memory.
 */
export async function getPrCheckAnnotations(
  owner: string,
  repo: string,
  checkRunId: number,
): Promise<PrCheckAnnotation[]> {
  return safeGhCommand(async () => {
    const result = await $`gh api repos/${owner}/${repo}/check-runs/${checkRunId}/annotations --paginate`.json() as any[]
    const raw = Array.isArray(result) ? result : []
    const mapped: PrCheckAnnotation[] = []
    // Dedupe within a single check — matrix builds (e.g. .NET's multiple
    // target frameworks) fire the same compiler annotation once per
    // build pass. The user still sees the error N times if N checks
    // fail, which is what they want; we only collapse *within* a check.
    const seen = new Set<string>()
    for (const a of raw) {
      if (!a?.path) continue
      // Actions emits synthetic workflow-level annotations with
      // `path=".github"` (e.g. "Process completed with exit code 1.").
      // They duplicate — and bury — the real compiler/test failures
      // emitted on the same check. Drop them (spec 043).
      if (a.path === ".github") continue
      const level = (a.annotation_level as PrCheckAnnotation["level"]) ?? "failure"
      const message = a.message ?? ""
      const key = `${a.path}|${a.start_line ?? 0}|${a.start_column ?? ""}|${level}|${message}`
      if (seen.has(key)) continue
      seen.add(key)
      mapped.push({
        path: a.path,
        startLine: a.start_line ?? 0,
        endLine: a.end_line ?? a.start_line ?? 0,
        startColumn: a.start_column ?? undefined,
        endColumn: a.end_column ?? undefined,
        level,
        message,
        title: a.title ?? undefined,
        rawDetailsUrl: a.raw_details_url ?? undefined,
      })
      if (mapped.length >= 100) break
    }
    return mapped
  })
}

/**
 * Fetch the current user's pending (draft) review on a PR, if any.
 * Returns null if no pending review exists.
 */
export async function getPendingReview(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PendingReview | null> {
  try {
    // Get current user
    const currentUser = await getCurrentUser()
    if (currentUser === "@you") {
      return null // Can't determine user
    }

    // Fetch all reviews for the PR
    const reviews = await $`gh api --paginate repos/${owner}/${repo}/pulls/${prNumber}/reviews`.json() as any[]
    
    // Find pending review by current user
    const pendingReview = reviews.find(
      (r: any) => r.state === "PENDING" && r.user?.login === currentUser
    )
    
    if (!pendingReview) {
      return null
    }

    // Fetch comments for this pending review
    const reviewComments = await $`gh api --paginate repos/${owner}/${repo}/pulls/${prNumber}/reviews/${pendingReview.id}/comments`.json() as any[]

    return {
      id: pendingReview.id,
      user: currentUser,
      body: pendingReview.body || "",
      comments: reviewComments.map((c: any) => ({
        id: c.id,
        body: c.body,
        path: c.path,
        // GitHub returns line/original_line for absolute line numbers,
        // or position/original_position for diff hunk position
        line: c.line || c.original_line || c.position || c.original_position || 0,
        side: (c.side || "RIGHT") as "LEFT" | "RIGHT",
        inReplyToId: c.in_reply_to_id,
      })),
    }
  } catch {
    // Silently fail - pending review detection is not critical
    return null
  }
}

/**
 * Delete a pending review (to allow submitting a new one or standalone comments)
 */
export async function deletePendingReview(
  owner: string,
  repo: string,
  prNumber: number,
  reviewId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await $`gh api -X DELETE repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}`
    return { success: true }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

/**
 * Fetch PR diff
 */
export async function getPrDiff(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<string> {
  return safeGhCommand(async () => {
    const repoArgs = owner && repo ? ["-R", `${owner}/${repo}`] : []
    return await $`gh pr diff ${prNumber} ${repoArgs}`.text()
  })
}

/**
 * Fetch the diff for a specific commit in a PR
 */
export async function fetchCommitDiff(
  owner: string,
  repo: string,
  sha: string
): Promise<string> {
  return safeGhCommand(async () => {
    return await $`gh api repos/${owner}/${repo}/commits/${sha} -H "Accept: application/vnd.github.diff"`.text()
  })
}

/**
 * Edit PR title and/or body
 */
export async function editPullRequest(
  prNumber: number,
  title: string,
  body: string,
  owner?: string,
  repo?: string
): Promise<void> {
  return safeGhCommand(async () => {
    const repoArgs = owner && repo ? ["-R", `${owner}/${repo}`] : []
    await $`gh pr edit ${prNumber} ${repoArgs} --title ${title} --body ${body}`
  })
}

export interface CreatePrResult {
  prNumber: number
  url: string
}

/**
 * Create a new pull request from the current branch.
 * Uses `gh pr create` which handles pushing the branch if needed.
 */
export async function createPullRequest(
  title: string,
  body: string,
  draft: boolean = false
): Promise<CreatePrResult> {
  return safeGhCommand(async () => {
    const draftArgs = draft ? ["--draft"] : []
    // gh pr create will push the branch if needed
    const result = await $`gh pr create --title ${title} --body ${body} ${draftArgs} --json number,url`.json()
    return {
      prNumber: result.number,
      url: result.url,
    }
  })
}

/**
 * Fetch PR head commit SHA
 */
export async function getPrHeadSha(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<string> {
  return safeGhCommand(async () => {
    const repoArgs = owner && repo ? ["-R", `${owner}/${repo}`] : []
    const result = await $`gh pr view ${prNumber} ${repoArgs} --json headRefOid`.json()
    return result.headRefOid
  })
}

/**
 * Raw reactionGroups node as returned by GitHub GraphQL.
 */
interface RawReactionGroup {
  content: string
  viewerHasReacted: boolean
  reactors: { totalCount: number }
}

/**
 * Convert GitHub's GraphQL reactionGroups array into riff's ReactionSummary[].
 * Drops unknown content values (future GitHub additions) and zero-count groups
 * — the palette submenu fabricates rows for the full 8-reaction set anyway,
 * so we only carry non-empty state.
 */
function parseReactionGroups(groups: RawReactionGroup[] | undefined): ReactionSummary[] {
  if (!groups) return []
  const known = new Set<string>(REACTION_CONTENT)
  const out: ReactionSummary[] = []
  for (const g of groups) {
    if (!known.has(g.content)) continue
    const count = g.reactors?.totalCount ?? 0
    if (count === 0 && !g.viewerHasReacted) continue
    out.push({
      content: g.content as ReactionContent,
      count,
      viewerHasReacted: Boolean(g.viewerHasReacted),
    })
  }
  return out
}

/**
 * Thread info from GraphQL (for resolution state + reactions).
 * We pull every comment in the thread (not just the root) so reactions can
 * be attached to replies too (spec 042).
 */
interface GraphQLThreadInfo {
  id: string  // node_id for GraphQL mutations
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  comments: {
    nodes: Array<{
      databaseId: number
      reactionGroups?: RawReactionGroup[]
    }>
  }
}

/**
 * Fetch PR review threads via GraphQL (includes resolution state + reactions)
 */
/**
 * How many comments per thread to pull reactions for.
 *
 * This number is the single biggest lever on riff's GraphQL budget. GitHub
 * prices a query by its *nested* node count — `reviewThreads(first:100)` x
 * `comments(first:N)` costs roughly `100 * N / 100` points — so the depth
 * here multiplies straight into the hourly 5000-point quota. Measured
 * against a real PR: N=50 costs 51 points, N=1 costs 2.
 */
/**
 * Resolution state for a PR's review threads, keyed by root comment id.
 */
export interface ReviewThreadState {
  rootCommentId: number
  isResolved: boolean
  isOutdated: boolean
}

/**
 * The cheapest question riff can ask about review threads — measured at 1
 * GraphQL point, since nothing nested is requested beyond the root id.
 *
 * Exists for the poller's idle path: resolving a thread doesn't touch any
 * comment's `updated_at`, so a conditional REST check on the comments can't
 * see it. This fills that gap without re-fetching bodies.
 */
export async function getPrThreadStates(
  owner: string,
  repo: string,
  prNumber: number
): Promise<ReviewThreadState[]> {
  const query = `
    query($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
              isOutdated
              comments(first: 1) { nodes { databaseId } }
            }
          }
        }
      }
    }
  `

  try {
    const result = await $`gh api graphql -f query=${query} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber}`.json() as any
    const nodes = result?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? []
    return nodes.flatMap((node: any) => {
      const rootCommentId = node?.comments?.nodes?.[0]?.databaseId
      return rootCommentId
        ? [{
            rootCommentId,
            isResolved: Boolean(node.isResolved),
            isOutdated: Boolean(node.isOutdated),
          }]
        : []
    })
  } catch {
    // Same graceful degradation as getPrReviewThreads — resolution state is
    // additive, and a failed poll tick should not disturb what's on screen.
    return []
  }
}

export const THREAD_COMMENTS_FULL = 50

/**
 * Depth for the background poller, which runs on a timer and would otherwise
 * spend the whole quota on its own. Root comments still carry reactions;
 * replies come back without them, so `mergeComments` keeps whatever the
 * previous full fetch already established.
 */
export const THREAD_COMMENTS_PROBE = 1

async function getPrReviewThreads(
  owner: string,
  repo: string,
  prNumber: number,
  commentsPerThread: number = THREAD_COMMENTS_FULL
): Promise<GraphQLThreadInfo[]> {
  const query = `
    query($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              isOutdated
              path
              line
              comments(first: ${commentsPerThread}) {
                nodes {
                  databaseId
                  reactionGroups {
                    content
                    viewerHasReacted
                    reactors(first: 0) { totalCount }
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  try {
    const result = await $`gh api graphql -f query=${query} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber}`.json() as any
    return result?.data?.repository?.pullRequest?.reviewThreads?.nodes || []
  } catch {
    // Fall back gracefully if GraphQL fails
    return []
  }
}

/**
 * Fetch PR review comments (inline comments on diff)
 */
export async function getPrComments(
  owner: string,
  repo: string,
  prNumber: number,
  commentsPerThread: number = THREAD_COMMENTS_FULL
): Promise<PrComment[]> {
  return safeGhCommand(async () => {
    // Fetch REST comments and GraphQL threads in parallel
    const [restComments, threads] = await Promise.all([
      fetchRestReviewComments(owner, repo, prNumber),
      getPrReviewThreads(owner, repo, prNumber, commentsPerThread),
    ])
    return mergeReviewComments(restComments, threads)
  })
}

/**
 * Raw review comments straight off REST. `--paginate` because GitHub caps a
 * page at 30 and a busy PR blows past that.
 */
export async function fetchRestReviewComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<any[]> {
  return safeGhCommand(
    async () => await $`gh api --paginate repos/${owner}/${repo}/pulls/${prNumber}/comments`.json() as any[]
  )
}

/**
 * Fold GraphQL thread state (resolution, outdated-ness, reactions) into the
 * REST comment records, which are the ones carrying `diff_hunk` and the
 * reply chain.
 */
export function mergeReviewComments(
  restComments: any[],
  threads: GraphQLThreadInfo[]
): PrComment[] {
  // Build a map from first comment ID to thread info
  const threadByFirstCommentId = new Map<number, GraphQLThreadInfo>()
  // Reactions by comment databaseId — every comment in every thread, not
  // just roots (spec 042).
  const reactionsByCommentId = new Map<number, ReactionSummary[]>()
  for (const thread of threads) {
    const nodes = thread.comments?.nodes ?? []
    const firstCommentId = nodes[0]?.databaseId
    if (firstCommentId) {
      threadByFirstCommentId.set(firstCommentId, thread)
    }
    for (const node of nodes) {
      if (node.databaseId) {
        reactionsByCommentId.set(node.databaseId, parseReactionGroups(node.reactionGroups))
      }
    }
  }

  // First pass: convert all comments
  const comments: PrComment[] = restComments.map((c: any) => {
    // Find thread info for this comment
    // If this is a root comment (no in_reply_to_id), check if it's in our map
    const thread = !c.in_reply_to_id ? threadByFirstCommentId.get(c.id) : undefined

    return {
      id: c.id,
      body: c.body,
      path: c.path,
      line: c.line || c.original_line,
      side: c.side || "RIGHT",
      author: c.user.login,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      url: c.html_url,
      diffHunk: c.diff_hunk,
      inReplyToId: c.in_reply_to_id,
      // GitHub's pull_request_review_id groups comments into a thread
      threadId: c.pull_request_review_id,
      // GraphQL thread info (only available on root comments)
      graphqlThreadId: thread?.id,
      isThreadResolved: thread?.isResolved,
      // Prefer GraphQL — falls back to inferring from REST when the
      // thread lookup didn't resolve (e.g. deeply paginated PRs that
      // overflow the 100-thread cap). REST sets `line=null` and only
      // populates `original_line` when the comment is outdated.
      isOutdated: thread?.isOutdated ?? (c.line === null && c.original_line != null),
      reactions: reactionsByCommentId.get(c.id) ?? [],
    }
  })

  // Second pass: replies often have line=null from the REST API.
  // Inherit line/side/path from the root comment in the same thread.
  const byId = new Map<number, PrComment>()
  for (const c of comments) byId.set(c.id, c)

  for (const c of comments) {
    if (c.inReplyToId && !c.line) {
      // Walk up the reply chain to find the root with a valid line
      let parent = byId.get(c.inReplyToId)
      while (parent) {
        if (parent.line) {
          c.line = parent.line
          c.side = parent.side
          c.path = parent.path
          break
        }
        parent = parent.inReplyToId ? byId.get(parent.inReplyToId) : undefined
      }
    }
  }

  return comments
}

/**
 * Fetch PR conversation comments (issue comments - not attached to code)
 * These appear in the PR "Conversation" tab
 */
export async function getPrConversationComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrConversationComment[]> {
  return safeGhCommand(async () => {
    // PR conversation comments use the issues API endpoint
    const comments = await $`gh api --paginate repos/${owner}/${repo}/issues/${prNumber}/comments`.json() as any[]
    
    return comments.map((c: any) => ({
      id: c.id,
      body: c.body,
      author: c.user.login,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      url: c.html_url,
      isBot: c.user.login.endsWith('[bot]') || c.user.type === 'Bot',
    }))
  })
}

// ============================================================================
// PR Session Loading
// ============================================================================

/**
 * Convert a GitHub PR comment to our Comment type
 */
function convertPrComment(c: PrComment, prHeadSha: string): Comment {
  return {
    id: `gh-${c.id}`,
    filename: c.path,
    line: c.line,
    side: c.side,
    body: c.body,
    createdAt: c.createdAt,
    commit: prHeadSha, // Link to PR head commit
    diffHunk: c.diffHunk, // Preserve code context
    status: "synced",
    githubId: c.id,
    githubUrl: c.url,
    githubThreadId: c.graphqlThreadId, // For GraphQL resolve/unresolve mutations
    githubReviewId: c.threadId, // The pull_request_review_id linking to parent review
    isThreadResolved: c.isThreadResolved, // Thread resolution state (only on root comments)
    outdated: c.isOutdated, // Thread anchor lines no longer match HEAD
    author: c.author, // Preserve original author
    inReplyTo: c.inReplyToId ? `gh-${c.inReplyToId}` : undefined,
    reactions: c.reactions,
  }
}

/**
 * Fetch the users GitHub would accept as @mentions in this repo — the same
 * pool its own comment box autocompletes from (contributors + collaborators).
 *
 * Best-effort: returns an empty list when the call fails (offline, no access),
 * because the caller falls back to the participants it derived from the PR.
 *
 * Capped at MENTIONABLE_PAGES pages: the pool is a convenience list that gets
 * fuzzy-filtered down to a handful of visible rows, so exhausting a repo with
 * thousands of contributors would cost round-trips nobody benefits from.
 */
export async function getMentionableUsers(
  owner: string,
  repo: string,
): Promise<string[]> {
  const query = `query($owner:String!,$repo:String!,$cursor:String){
    repository(owner:$owner,name:$repo){
      mentionableUsers(first:100,after:$cursor){
        nodes{login}
        pageInfo{hasNextPage endCursor}
      }
    }
  }`

  const logins: string[] = []
  let cursor: string | null = null

  for (let page = 0; page < MENTIONABLE_PAGES; page++) {
    const cursorArgs = cursor ? ["-F", `cursor=${cursor}`] : []
    const result = await $`gh api graphql -f query=${query} -F owner=${owner} -F repo=${repo} ${cursorArgs}`
      .quiet()
      .nothrow()
    if (result.exitCode !== 0) break

    const parsed = safeJson(result.stdout.toString()) as {
      data?: { repository?: { mentionableUsers?: {
        nodes?: { login?: string }[]
        pageInfo?: { hasNextPage?: boolean; endCursor?: string }
      } } }
    } | null

    const page_ = parsed?.data?.repository?.mentionableUsers
    if (!page_) break

    for (const node of page_.nodes ?? []) {
      if (node.login) logins.push(node.login)
    }

    if (!page_.pageInfo?.hasNextPage || !page_.pageInfo.endCursor) break
    cursor = page_.pageInfo.endCursor
  }

  return logins
}

/**
 * Titles and states for the pull requests and issues a batch of comments
 * point at (spec 059).
 *
 * One query for the lot, aliased per reference — a comment thread routinely
 * mentions a dozen, and a round trip each would be slower than the panel they
 * are being drawn into.
 *
 * Best-effort like everything else here: unknown numbers, deleted issues and
 * a failed call all come back as "riff has no answer", and the reference is
 * left as the author wrote it.
 */
export async function getReferenceTitles(
  keys: readonly string[],
): Promise<Map<string, { title: string; state: string; pull: boolean }>> {
  const resolved = new Map<string, { title: string; state: string; pull: boolean }>()
  if (keys.length === 0) return resolved

  const parsed = keys
    .map((key) => {
      const match = key.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/)
      return match ? { key, owner: match[1]!, repo: match[2]!, number: Number(match[3]) } : null
    })
    .filter((entry): entry is { key: string; owner: string; repo: string; number: number } => entry !== null)

  for (let start = 0; start < parsed.length; start += REFERENCE_BATCH) {
    const batch = parsed.slice(start, start + REFERENCE_BATCH)
    const fields = batch
      .map(
        (entry, index) =>
          `r${index}: repository(owner:${JSON.stringify(entry.owner)},name:${JSON.stringify(entry.repo)}){` +
          `issueOrPullRequest(number:${entry.number}){` +
          `__typename ... on PullRequest{title state isDraft} ... on Issue{title state}}}`,
      )
      .join("\n")

    // The exit code is ignored on purpose: one unknown number in the batch
    // makes `gh` exit non-zero while still printing every answer it did get.
    const result = await $`gh api graphql -f query=${`query{${fields}}`}`.quiet().nothrow()

    const data = (safeJson(result.stdout.toString()) as {
      data?: Record<string, { issueOrPullRequest?: {
        __typename?: string
        title?: string
        state?: string
        isDraft?: boolean
      } } | null>
    } | null)?.data
    if (!data) continue

    for (const [index, entry] of batch.entries()) {
      const node = data[`r${index}`]?.issueOrPullRequest
      if (!node?.title || !node.state) continue
      const pull = node.__typename === "PullRequest"
      resolved.set(entry.key, {
        title: node.title,
        state: pull && node.isDraft && node.state === "OPEN" ? "draft" : node.state.toLowerCase(),
        pull,
      })
    }
  }

  return resolved
}

/**
 * Ask GitHub for mentionable users matching `query`. This is the escape hatch
 * for orgs bigger than the prefetch cap: the roster riff caches is a prefix of
 * the repo's mentionable users, so someone who has never touched this repo
 * won't be in it, but they will be here.
 *
 * GitHub matches the fragment against both login and display name, so
 * "koeck" finds `hkoeck` as well as a user named "Koeck".
 */
export async function searchMentionableUsers(
  owner: string,
  repo: string,
  query: string,
): Promise<string[]> {
  // The variable is `q`, not `query`: `gh api graphql` uses `query` for the
  // document itself, so a variable of that name silently replaces it.
  const gql = `query($owner:String!,$repo:String!,$q:String!){
    repository(owner:$owner,name:$repo){
      mentionableUsers(first:20,query:$q){
        nodes{login}
      }
    }
  }`

  const result = await $`gh api graphql -f query=${gql} -F owner=${owner} -F repo=${repo} -F q=${query}`
    .quiet()
    .nothrow()
  if (result.exitCode !== 0) return []

  const parsed = safeJson(result.stdout.toString()) as {
    data?: { repository?: { mentionableUsers?: { nodes?: { login?: string }[] } } }
  } | null

  return (parsed?.data?.repository?.mentionableUsers?.nodes ?? [])
    .map((n) => n.login)
    .filter((login): login is string => Boolean(login))
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Fetch just the PR review comments (root + replies) as our `Comment` type,
 * without touching the diff, checks, reviews, or local markdown storage.
 *
 * This is the lightweight read the background comment poller ticks on — it
 * must stay cheap enough to run every minute, so it deliberately skips the
 * heavy `loadPrSession` work and does no disk I/O.
 */
export async function fetchPrReviewComments(
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  commentsPerThread: number = THREAD_COMMENTS_FULL
): Promise<Comment[]> {
  const prComments = await getPrComments(owner, repo, prNumber, commentsPerThread)
  return prComments.map((c) => convertPrComment(c, headSha))
}

// ============================================================================
// Consolidated PR fetch
// ============================================================================

/**
 * Everything about a PR that lives behind GitHub's GraphQL `pullRequest` node.
 *
 * Startup used to assemble this from seven separate `gh` invocations —
 * `gh pr view` twice, three `gh api graphql` queries, and two REST calls —
 * each paying its own process spawn and API round-trip, several of them
 * fetching the very same commits and reviews. They're one query now.
 */
const PR_BUNDLE_QUERY = `
  query($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        number title body state isDraft url
        additions deletions changedFiles createdAt updatedAt
        headRefName baseRefName headRefOid
        author { login __typename }
        headRepository { name }
        headRepositoryOwner { login }
        reactionGroups { content viewerHasReacted reactors(first: 0) { totalCount } }
        commits(first: 100) {
          nodes { commit {
            oid messageHeadline committedDate
            authors(first: 1) { nodes { user { login } name } }
          } }
        }
        reviews(first: 100) {
          nodes {
            id databaseId state body submittedAt url
            author { login __typename }
            reactionGroups { content viewerHasReacted reactors(first: 0) { totalCount } }
          }
        }
        reviewRequests(first: 50) {
          nodes { requestedReviewer {
            __typename
            ... on User { login }
            ... on Bot { login }
            ... on Mannequin { login }
            ... on Team { name }
          } }
        }
        comments(first: 100) {
          nodes {
            databaseId body createdAt updatedAt url
            author { login __typename }
            reactionGroups { content viewerHasReacted reactors(first: 0) { totalCount } }
          }
        }
        reviewThreads(first: 100) {
          nodes {
            id isResolved isOutdated path line
            comments(first: ${THREAD_COMMENTS_FULL}) {
              nodes {
                databaseId
                reactionGroups { content viewerHasReacted reactors(first: 0) { totalCount } }
              }
            }
          }
        }
        files(first: 100) {
          nodes { path viewerViewedState }
          pageInfo { hasNextPage endCursor }
        }
        headCommit: commits(last: 1) {
          nodes { commit { statusCheckRollup { contexts(first: 100) { nodes {
            ... on CheckRun {
              databaseId name status conclusion detailsUrl startedAt completedAt
            }
          } } } } }
        }
      }
    }
  }
`

export interface PrBundle {
  /** Fully populated — commits, reviews, reviewers, conversation, checks, reactions. */
  prInfo: PrInfo
  headSha: string
  threads: GraphQLThreadInfo[]
  viewedStatuses: Map<string, boolean>
}

export async function fetchPrBundle(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrBundle> {
  return safeGhCommand(async () => {
    const result = await $`gh api graphql -f query=${PR_BUNDLE_QUERY} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber}`.json() as any
    const pr = result?.data?.repository?.pullRequest
    if (!pr) {
      throw new Error(`PR #${prNumber} not found in ${owner}/${repo}`)
    }

    const commits: PrCommit[] = (pr.commits?.nodes ?? []).map((n: any) => {
      const author = n.commit?.authors?.nodes?.[0]
      return {
        sha: n.commit.oid.slice(0, 7),
        message: n.commit.messageHeadline,
        author: author?.user?.login || author?.name || "unknown",
        date: n.commit.committedDate,
      }
    }).reverse() // Newest first

    const reviews: PrReview[] = (pr.reviews?.nodes ?? []).map((r: any) => ({
      id: r.id,
      databaseId: r.databaseId ?? undefined,
      author: authorLogin(r.author),
      state: r.state as PrReview["state"],
      body: r.body || undefined,
      submittedAt: r.submittedAt ?? undefined,
      url: r.url ?? undefined,
      reactions: parseReactionGroups(r.reactionGroups),
    }))

    const requestedReviewers: string[] = (pr.reviewRequests?.nodes ?? [])
      // A reviewer the token can't resolve comes back null.
      .filter((n: any) => n?.requestedReviewer)
      .map((n: any) => {
        const reviewer = n.requestedReviewer
        // Teams have no login; everyone else goes through the same bot-suffix
        // normalization as review authors, so the panel can match the two lists.
        return reviewer.login ? authorLogin(reviewer) : reviewer.name || "unknown"
      })

    const conversationComments: PrConversationComment[] = (pr.comments?.nodes ?? []).map((c: any) => ({
      id: c.databaseId,
      body: c.body,
      author: authorLogin(c.author),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      url: c.url,
      isBot: isBotAuthor(c.author),
      reactions: parseReactionGroups(c.reactionGroups),
    }))

    const rollup = pr.headCommit?.nodes?.[0]?.commit?.statusCheckRollup
    const checks: PrCheck[] = (rollup?.contexts?.nodes ?? [])
      // Legacy commit statuses share the connection with check runs; they have
      // no databaseId and no annotations, and riff has never shown them.
      .filter((n: any) => n?.databaseId != null)
      .map((n: any) => ({
        id: n.databaseId,
        name: n.name,
        status: normalizeCheckStatus(n.status),
        conclusion: normalizeCheckConclusion(n.conclusion),
        detailsUrl: n.detailsUrl || null,
        startedAt: n.startedAt || null,
        completedAt: n.completedAt || null,
      }))
      // The rollup hands them back in its own order; newest-first is what the
      // panel has always shown.
      .sort((a: PrCheck, b: PrCheck) => b.id - a.id)

    const prInfo: PrInfo = {
      number: pr.number,
      title: pr.title,
      body: pr.body || "",
      author: authorLogin(pr.author),
      state: String(pr.state).toLowerCase() as PrInfo["state"],
      isDraft: pr.isDraft,
      headRef: pr.headRefName,
      baseRef: pr.baseRefName,
      headRepoOwner: pr.headRepositoryOwner?.login || undefined,
      headRepoName: pr.headRepository?.name || undefined,
      owner,
      repo,
      url: pr.url,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      commits,
      reviews,
      requestedReviewers,
      conversationComments,
      checks,
      bodyReactions: parseReactionGroups(pr.reactionGroups),
    }

    const viewedStatuses = new Map<string, boolean>()
    for (const file of pr.files?.nodes ?? []) {
      viewedStatuses.set(file.path, file.viewerViewedState === "VIEWED")
    }
    // PRs over 100 files are rare enough to pay a second round-trip for.
    const filesPageInfo = pr.files?.pageInfo
    if (filesPageInfo?.hasNextPage && filesPageInfo?.endCursor) {
      for (const [path, viewed] of await fetchRemainingViewedStatuses(
        owner, repo, prNumber, filesPageInfo.endCursor
      )) {
        viewedStatuses.set(path, viewed)
      }
    }

    return {
      prInfo,
      headSha: pr.headRefOid,
      threads: pr.reviewThreads?.nodes ?? [],
      viewedStatuses,
    }
  })
}

/**
 * GraphQL hands back a bot's bare login (`dependabot`), where REST and
 * GitHub's own UI both write it `dependabot[bot]`. Comment authorship is
 * matched against those forms elsewhere, so settle on the suffixed one.
 */
function authorLogin(author: { login?: string; __typename?: string } | null | undefined): string {
  const login = author?.login
  if (!login) return "unknown"
  return isBotAuthor(author) && !login.endsWith("[bot]") ? `${login}[bot]` : login
}

function isBotAuthor(author: { login?: string; __typename?: string } | null | undefined): boolean {
  return author?.__typename === "Bot" || Boolean(author?.login?.endsWith("[bot]"))
}

/**
 * GraphQL reports check state as SCREAMING_CASE with more states than the
 * REST `check-runs` vocabulary riff's UI is written against.
 */
function normalizeCheckStatus(status: string | null): PrCheck["status"] {
  switch (status) {
    case "COMPLETED":
      return "completed"
    case "IN_PROGRESS":
      return "in_progress"
    default:
      return "queued"
  }
}

function normalizeCheckConclusion(conclusion: string | null): PrCheck["conclusion"] {
  switch (conclusion) {
    case "STARTUP_FAILURE":
      return "failure"
    case "STALE":
      return "neutral"
    case null:
    case undefined:
      return null
    default:
      return conclusion.toLowerCase() as PrCheck["conclusion"]
  }
}

/**
 * Load a GitHub PR - fetches data and persists to local markdown storage
 */
export async function loadPrSession(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<{ prInfo: PrInfo; diff: string; comments: Comment[]; viewedStatuses: Map<string, boolean>; headSha: string }> {
  // Resolve owner/repo first if needed
  let resolvedOwner = owner
  let resolvedRepo = repo
  if (!owner || !repo) {
    const current = await getCurrentRepo()
    resolvedOwner = current.owner
    resolvedRepo = current.repo
  }

  // Two round-trips: everything behind the `pullRequest` node in one GraphQL
  // query, plus the patch and the REST review comments (the only source for
  // `diff_hunk` and the reply chain) alongside it.
  const [bundle, diff, restComments] = await Promise.all([
    fetchPrBundle(resolvedOwner!, resolvedRepo!, prNumber),
    getPrDiff(prNumber, resolvedOwner, resolvedRepo),
    fetchRestReviewComments(resolvedOwner!, resolvedRepo!, prNumber),
  ])

  const { prInfo, headSha, viewedStatuses } = bundle
  const prComments = mergeReviewComments(restComments, bundle.threads)

  // Build source identifier for this PR
  const prSource = `gh:${resolvedOwner}/${resolvedRepo}#${prNumber}`
  
  // Load existing local comments first
  const existingComments = await loadComments(prSource)
  
  // Build a set of GitHub IDs we're fetching (as numbers)
  const fetchedGithubIds = new Set<number>(prComments.map(c => c.id))
  
  const githubComments = prComments.map((c) => convertPrComment(c, headSha))
  await Promise.all(githubComments.map((comment) => saveComment(comment, prSource)))
  
  // Merge: GitHub comments + local comments (that aren't already on GitHub)
  const comments: Comment[] = []
  
  // Track which local comments to delete (synced ones that now exist on GitHub)
  const localCommentsToDelete: string[] = []
  
  // Add existing comments, but skip any that are now on GitHub
  for (const existing of existingComments) {
    // Skip if this comment's githubId is in the fetched set
    // (either it was submitted and now exists on GitHub, or it was re-fetched)
    if (existing.githubId && fetchedGithubIds.has(existing.githubId)) {
      // If this is a local comment that was synced (has UUID id, not gh- prefix)
      // we should delete its local file since the GitHub version takes precedence
      if (!existing.id.startsWith("gh-")) {
        localCommentsToDelete.push(existing.id)
      }
      continue
    }
    
    // Skip if this is a gh- prefixed comment (will be re-added from fresh fetch)
    if (existing.id.startsWith("gh-") && fetchedGithubIds.has(existing.githubId ?? 0)) {
      continue
    }
    
    comments.push(existing)
  }
  
  // Delete local comment files that are now on GitHub
  await Promise.all(localCommentsToDelete.map((id) => deleteCommentFile(id, prSource)))

  comments.push(...githubComments)
  
  // Sort by createdAt
  comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // Save session metadata
  const session: ReviewSession = {
    id: crypto.randomUUID(),
    source: `gh:${prInfo.owner}/${prInfo.repo}#${prInfo.number}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prNumber: prInfo.number,
    owner: prInfo.owner,
    repo: prInfo.repo,
    reviewMode: "single",
  }
  await saveSession(session)

  return { prInfo, diff, comments, viewedStatuses, headSha }
}

// ============================================================================
// File Content Fetching
// ============================================================================

/**
 * Get file content from a PR (the "new" version after changes)
 * Uses the PR's head commit SHA
 */
export async function getPrFileContent(
  owner: string,
  repo: string,
  prNumber: number,
  filename: string,
  headSha?: string
): Promise<FileContentResult> {
  try {
    // Resolving the head costs a `gh pr view` — a GraphQL call, on the quota
    // riff's pollers already lean on. Callers that loaded the diff know the
    // revision, so pass it and skip the round trip.
    const ref = headSha || (await getPrHeadSha(prNumber, owner, repo))
    return decodeContentsResponse(
      await $`gh api repos/${owner}/${repo}/contents/${filename}?ref=${ref}`.json(),
      filename
    )
  } catch (error) {
    return { ok: false, error: await describeGhFailure(error) }
  }
}

const baseRefCache = new Map<string, Promise<string>>()

/**
 * The PR's base branch, memoized for the session. Only the fallback for a
 * caller that has no `baseRef` to hand — a PR can't change base under a
 * running review without a refresh.
 */
function getPrBaseRef(owner: string, repo: string, prNumber: number): Promise<string> {
  const key = `${owner}/${repo}#${prNumber}`
  const cached = baseRefCache.get(key)
  if (cached) return cached

  const pending = $`gh pr view ${prNumber} -R ${owner}/${repo} --json baseRefName`
    .json()
    .then((result: any) => result.baseRefName as string)
    .catch((err) => {
      baseRefCache.delete(key)
      throw err
    })
  baseRefCache.set(key, pending)
  return pending
}

/**
 * Get the "old" version of a file (base branch version)
 */
export async function getPrBaseFileContent(
  owner: string,
  repo: string,
  prNumber: number,
  filename: string,
  baseRef?: string
): Promise<FileContentResult> {
  try {
    const ref = baseRef || (await getPrBaseRef(owner, repo, prNumber))
    return decodeContentsResponse(
      await $`gh api repos/${owner}/${repo}/contents/${filename}?ref=${ref}`.json(),
      filename
    )
  } catch (error) {
    return { ok: false, error: await describeGhFailure(error) }
  }
}

interface ContentsResponse {
  encoding?: string
  content?: string
}

function decodeContentsResponse(
  result: ContentsResponse,
  filename: string
): FileContentResult {
  if (result.encoding === "base64" && result.content) {
    return { ok: true, content: Buffer.from(result.content, "base64").toString("utf-8") }
  }
  // Blobs over 1 MB come back with an empty body and encoding "none"; the
  // contents API can't serve them at all.
  return { ok: false, error: `GitHub returned no content for ${filename}` }
}

// ============================================================================
// Comment Submission
// ============================================================================

export interface SubmitResult {
  success: boolean
  githubId?: number
  githubUrl?: string
  error?: string
}

/**
 * Submit a single comment immediately to GitHub (like "Add single comment").
 *
 * If `range` is provided, the comment is posted as a multi-line review
 * comment spanning `range.startLine`..`comment.line` inclusive. Used by the
 * AI-drafted comment flow (spec 036) so Claude can flag a block of code
 * instead of just one line.
 */
export async function submitSingleComment(
  owner: string,
  repo: string,
  prNumber: number,
  comment: Comment,
  commitSha: string,
  range?: { startLine: number; startSide: "LEFT" | "RIGHT" }
): Promise<SubmitResult> {
  try {
    // Use -F for integer fields and -f for strings. `side` / `start_side`
    // must be uppercase: LEFT or RIGHT.
    const result = range
      ? await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments \
          -f body=${comment.body} \
          -f path=${comment.filename} \
          -F line=${comment.line} \
          -f side=${comment.side} \
          -F start_line=${range.startLine} \
          -f start_side=${range.startSide} \
          -f commit_id=${commitSha}`.json() as { id: number; html_url: string }
      : await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments \
          -f body=${comment.body} \
          -f path=${comment.filename} \
          -F line=${comment.line} \
          -f side=${comment.side} \
          -f commit_id=${commitSha}`.json() as { id: number; html_url: string }

    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}

/**
 * Submit a reply to an existing comment thread
 */
export async function submitReply(
  owner: string,
  repo: string,
  prNumber: number,
  comment: Comment,
  parentGithubId: number
): Promise<SubmitResult> {
  try {
    const result = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments/${parentGithubId}/replies \
      -f body=${comment.body}`.json() as { id: number; html_url: string }
    
    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}

/**
 * Submit a PR-level comment (appears in the conversation tab, not attached to code)
 * These use the issues API endpoint
 */
export async function submitPrComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<SubmitResult> {
  try {
    const result = await $`gh api repos/${owner}/${repo}/issues/${prNumber}/comments \
      -f body=${body}`.json() as { id: number; html_url: string }
    
    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}

/**
 * Update an existing comment on GitHub (PATCH)
 */
export async function updateComment(
  owner: string,
  repo: string,
  commentId: number,
  newBody: string
): Promise<SubmitResult> {
  try {
    const result = await $`gh api -X PATCH repos/${owner}/${repo}/pulls/comments/${commentId} \
      -f body=${newBody}`.json() as { id: number; html_url: string }
    
    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}

export interface DeleteResult {
  success: boolean
  error?: string
}

/**
 * Delete an existing comment on GitHub
 */
export async function deleteGitHubComment(
  owner: string,
  repo: string,
  commentId: number
): Promise<DeleteResult> {
  try {
    await $`gh api -X DELETE repos/${owner}/${repo}/pulls/comments/${commentId}`.quiet()
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}



/**
 * Submit an existing pending review (without adding new comments)
 */
export async function submitExistingReview(
  owner: string,
  repo: string,
  prNumber: number,
  reviewId: number,
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
  body: string = ""
): Promise<SubmitResult> {
  try {
    const result = await $`gh api -X POST repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/events \
      -f event=${event} \
      -f body=${body}`.json() as { id: number; html_url: string }
    
    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}

/**
 * Submit a review with multiple comments as a batch.
 * If pendingReviewId is provided, submits the existing pending review first,
 * then creates a new review with local comments (if any).
 */
export async function submitReview(
  owner: string,
  repo: string,
  prNumber: number,
  comments: Comment[],
  commitSha: string,
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = "COMMENT",
  body: string = "",
  pendingReviewId?: number
): Promise<SubmitResult> {
  try {
    // If there's an existing pending review, submit it first with the chosen event
    if (pendingReviewId) {
      const pendingResult = await submitExistingReview(
        owner, repo, prNumber, pendingReviewId, event, body
      )
      if (!pendingResult.success) {
        return pendingResult
      }
      
      // If we have local comments to add, create a second review for them
      // (as COMMENT only, since the event was already applied to the pending review)
      if (comments.length > 0) {
        const reviewComments = comments.map(c => ({
          path: c.filename,
          line: c.line,
          side: c.side,
          body: c.body,
        }))
        
        const payload = JSON.stringify({
          commit_id: commitSha,
          event: "COMMENT", // Always COMMENT for the follow-up
          body: "",
          comments: reviewComments,
        })
        
        const result = await $`echo ${payload} | gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --method POST --input -`.json() as { id: number; html_url: string }
        
        return {
          success: true,
          githubId: result.id,
          githubUrl: result.html_url,
        }
      }
      
      // No local comments, just return the pending review result
      return pendingResult
    }
    
    // No pending review - create a new review with all comments
    const reviewComments = comments.map(c => ({
      path: c.filename,
      line: c.line,
      side: c.side,
      body: c.body,
    }))
    
    // Create the review payload
    const payload = JSON.stringify({
      commit_id: commitSha,
      event,
      body,
      comments: reviewComments,
    })
    
    // Submit via gh api with JSON input using echo pipe
    // Must use --method POST explicitly when using --input
    const result = await $`echo ${payload} | gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --method POST --input -`.json() as { id: number; html_url: string }
    
    return {
      success: true,
      githubId: result.id,
      githubUrl: result.html_url,
    }
  } catch (err) {
    return {
      success: false,
      error: extractShellError(err),
    }
  }
}

// ============================================================================
// Reactions (spec 042)
// ============================================================================

export interface AddReactionResult {
  success: boolean
  reactionId?: number
  error?: string
}

export interface RemoveReactionResult {
  success: boolean
  error?: string
}

/**
 * Build the REST path for a reaction target. All four reactable surfaces
 * mount reactions at `<target>/reactions`; POST creates, DELETE at
 * `<target>/reactions/<id>` removes.
 */
function reactionPath(
  target: ReactionTarget,
  owner: string,
  repo: string,
): string {
  switch (target.kind) {
    case "review-comment":
      return `repos/${owner}/${repo}/pulls/comments/${target.githubId}/reactions`
    case "issue-comment":
      return `repos/${owner}/${repo}/issues/comments/${target.githubId}/reactions`
    case "review":
      return `repos/${owner}/${repo}/pulls/${target.prNumber}/reviews/${target.reviewId}/reactions`
    case "issue":
      return `repos/${owner}/${repo}/issues/${target.prNumber}/reactions`
  }
}

/**
 * Add a reaction to a PR-side entity. Returns the new reaction's REST id
 * so callers can stash it for fast removal later (spec 042).
 */
export async function addReaction(
  target: ReactionTarget,
  content: ReactionContent,
  owner: string,
  repo: string,
): Promise<AddReactionResult> {
  try {
    const path = reactionPath(target, owner, repo)
    const result = await $`gh api -X POST ${path} -f content=${content}`.json() as { id: number }
    return { success: true, reactionId: result.id }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

/**
 * Remove a reaction. If `reactionId` is known (e.g. stashed from a prior
 * add in this session), we DELETE it directly. If it isn't — the viewer
 * reacted before riff was loaded and we only know they reacted, not the
 * reaction id — list the reactions on the target, find the viewer's, and
 * delete that one. Two round-trips for this rarer case.
 */
export async function removeReaction(
  target: ReactionTarget,
  content: ReactionContent,
  owner: string,
  repo: string,
  reactionId: number | undefined,
): Promise<RemoveReactionResult> {
  try {
    const basePath = reactionPath(target, owner, repo)
    let id = reactionId
    if (id === undefined) {
      const currentUser = await getCurrentUser()
      const reactions = await $`gh api --paginate ${basePath}?content=${content}`.json() as Array<{
        id: number
        content: string
        user?: { login?: string }
      }>
      const mine = reactions.find(r => r.content === content && r.user?.login === currentUser)
      if (!mine) {
        // Nothing to delete — treat as success so the optimistic UI
        // stays consistent with the real server state.
        return { success: true }
      }
      id = mine.id
    }
    await $`gh api -X DELETE ${basePath}/${id}`.quiet()
    return { success: true }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

// ============================================================================
// Thread Resolution
// ============================================================================

export interface ResolveResult {
  success: boolean
  isResolved?: boolean
  error?: string
}

/**
 * Resolve a review thread via GraphQL API
 */
export async function resolveThread(threadId: string): Promise<ResolveResult> {
  const mutation = `
    mutation($threadId: ID!) {
      resolveReviewThread(input: { threadId: $threadId }) {
        thread {
          isResolved
        }
      }
    }
  `
  
  try {
    const result = await $`gh api graphql -f query=${mutation} -F threadId=${threadId}`.json() as any
    const isResolved = result?.data?.resolveReviewThread?.thread?.isResolved
    
    if (isResolved === undefined) {
      return { success: false, error: "Unexpected response from GitHub" }
    }
    
    return { success: true, isResolved }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

/**
 * Unresolve a review thread via GraphQL API
 */
export async function unresolveThread(threadId: string): Promise<ResolveResult> {
  const mutation = `
    mutation($threadId: ID!) {
      unresolveReviewThread(input: { threadId: $threadId }) {
        thread {
          isResolved
        }
      }
    }
  `
  
  try {
    const result = await $`gh api graphql -f query=${mutation} -F threadId=${threadId}`.json() as any
    const isResolved = result?.data?.unresolveReviewThread?.thread?.isResolved
    
    if (isResolved === undefined) {
      return { success: false, error: "Unexpected response from GitHub" }
    }
    
    return { success: true, isResolved }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

/**
 * Toggle thread resolution state
 */
export async function toggleThreadResolution(
  threadId: string,
  currentlyResolved: boolean
): Promise<ResolveResult> {
  return currentlyResolved ? unresolveThread(threadId) : resolveThread(threadId)
}

// ============================================================================
// Viewed Files Sync
// ============================================================================

export type ViewerViewedState = "VIEWED" | "UNVIEWED" | "DISMISSED"

export interface ViewedFileStatus {
  path: string
  viewerViewedState: ViewerViewedState
}

const VIEWED_STATUS_PAGE_QUERY = `
  query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        files(first: 100, after: $cursor) {
          nodes { path viewerViewedState }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`

/**
 * Continue a viewed-status listing past the first page of files that
 * `fetchPrBundle` already carries. Only PRs over 100 files get here.
 */
async function fetchRemainingViewedStatuses(
  owner: string,
  repo: string,
  prNumber: number,
  cursor: string
): Promise<Map<string, boolean>> {
  const statuses = new Map<string, boolean>()

  try {
    while (true) {
      const result = await $`gh api graphql -f query=${VIEWED_STATUS_PAGE_QUERY} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber} -F cursor=${cursor}`.json() as any
      const files = result?.data?.repository?.pullRequest?.files

      for (const file of files?.nodes ?? []) {
        // viewerViewedState: "VIEWED" | "UNVIEWED" | "DISMISSED"
        statuses.set(file.path, file.viewerViewedState === "VIEWED")
      }

      if (!files?.pageInfo?.hasNextPage || !files.pageInfo.endCursor) {
        return statuses
      }
      cursor = files.pageInfo.endCursor
    }
  } catch {
    // Partial statuses beat none — the rest just show as unviewed.
    return statuses
  }
}

export interface ViewedSyncResult {
  success: boolean
  error?: string
}

/**
 * Mark a file as viewed or unviewed on GitHub via GraphQL mutation.
 */
export async function markFileViewedOnGitHub(
  owner: string,
  repo: string,
  prNumber: number,
  path: string,
  viewed: boolean
): Promise<ViewedSyncResult> {
  try {
    // First get the PR node ID (required for the mutation)
    const prQuery = `
      query($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            id
          }
        }
      }
    `
    
    const prResult = await $`gh api graphql -f query=${prQuery} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber}`.json() as any
    const prId = prResult?.data?.repository?.pullRequest?.id
    
    if (!prId) {
      return { success: false, error: "Could not get PR ID" }
    }
    
    // Use the appropriate mutation
    const mutationName = viewed ? "markFileAsViewed" : "unmarkFileAsViewed"
    const mutation = `
      mutation($prId: ID!, $path: String!) {
        ${mutationName}(input: {
          pullRequestId: $prId
          path: $path
        }) {
          pullRequest {
            id
          }
        }
      }
    `
    
    await $`gh api graphql -f query=${mutation} -F prId=${prId} -F path=${path}`.quiet()
    
    return { success: true }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

/**
 * Batch mark multiple files as viewed on GitHub.
 * More efficient than individual calls for bulk operations.
 */
export async function markFilesViewedOnGitHub(
  owner: string,
  repo: string,
  prNumber: number,
  files: { path: string; viewed: boolean }[]
): Promise<ViewedSyncResult[]> {
  // Run in parallel with limited concurrency
  const results: ViewedSyncResult[] = []
  const concurrency = 5
  
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(f => markFileViewedOnGitHub(owner, repo, prNumber, f.path, f.viewed))
    )
    results.push(...batchResults)
  }
  
  return results
}
