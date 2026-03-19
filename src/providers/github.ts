import { $ } from "bun"
import { saveComment, saveSession, loadComments, deleteCommentFile } from "../storage"
import type { Comment, ReviewSession } from "../types"

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract a useful error message from a Bun shell error.
 * Bun's ShellError has stderr which contains the actual error,
 * while message is just "Failed with exit code N".
 */
function extractShellError(err: unknown): string {
  if (err && typeof err === "object") {
    // Check for Bun ShellError which has stderr
    const shellErr = err as { stderr?: Buffer; message?: string }
    if (shellErr.stderr) {
      const stderrStr = shellErr.stderr.toString().trim()
      // Try to parse JSON error from gh cli (GitHub API errors)
      const jsonMatch = stderrStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.message) {
            return parsed.message
          }
        } catch {
          // Ignore parse errors
        }
      }
      // Return raw stderr if no JSON found
      if (stderrStr) {
        return stderrStr
      }
    }
    // Fallback to message
    if (shellErr.message) {
      return shellErr.message
    }
  }
  return err instanceof Error ? err.message : String(err)
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
}

export interface PrCommit {
  sha: string        // Short SHA (7 chars)
  message: string    // First line of commit message
  author: string
  date: string       // ISO date
}

export interface PrReview {
  id: string  // GraphQL ID (PRR_...)
  author: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED"
  body?: string  // Review summary comment
  submittedAt?: string
  url?: string
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

// ============================================================================
// GitHub API functions
// ============================================================================

/**
 * Get current repo's owner and name from gh CLI
 */
export async function getCurrentRepo(): Promise<{ owner: string; repo: string }> {
  return safeGhCommand(async () => {
    const result = await $`gh repo view --json owner,name`.json()
    return {
      owner: result.owner.login,
      repo: result.name,
    }
  })
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
 * Fetch PR metadata
 */
export async function getPrInfo(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<PrInfo> {
  return safeGhCommand(async () => {
    const repoArgs = owner && repo ? ["-R", `${owner}/${repo}`] : []

    const result = await $`gh pr view ${prNumber} ${repoArgs} --json number,title,body,author,state,isDraft,headRefName,baseRefName,url,additions,deletions,changedFiles,createdAt,updatedAt,reviews,commits`.json()

    // Get owner/repo if not provided
    let finalOwner = owner
    let finalRepo = repo
    if (!owner || !repo) {
      const current = await getCurrentRepo()
      finalOwner = current.owner
      finalRepo = current.repo
    }

    // Parse and deduplicate reviews (keep latest per author)
    const rawReviews: PrReview[] = (result.reviews || []).map((r: any) => ({
      id: r.id,
      author: r.author?.login || "unknown",
      state: r.state as PrReview["state"],
      body: r.body || undefined,
      submittedAt: r.submittedAt,
    }))
    const latestReviews = new Map<string, PrReview>()
    for (const review of rawReviews) {
      const existing = latestReviews.get(review.author)
      if (!existing || (review.submittedAt && existing.submittedAt && review.submittedAt > existing.submittedAt)) {
        latestReviews.set(review.author, review)
      }
    }

    // Parse commits (newest first)
    const commits: PrCommit[] = (result.commits || []).map((c: any) => ({
      sha: c.oid.slice(0, 7),
      message: c.messageHeadline,
      author: c.authors?.[0]?.login || c.authors?.[0]?.name || "unknown",
      date: c.committedDate,
    })).reverse()

    return {
      number: result.number,
      title: result.title,
      body: result.body || "",
      author: result.author.login,
      state: result.state.toLowerCase() as "open" | "closed" | "merged",
      isDraft: result.isDraft,
      headRef: result.headRefName,
      baseRef: result.baseRefName,
      owner: finalOwner!,
      repo: finalRepo!,
      url: result.url,
      additions: result.additions,
      deletions: result.deletions,
      changedFiles: result.changedFiles,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      reviews: Array.from(latestReviews.values()),
      commits,
    }
  })
}

/**
 * Fetch extended PR info (commits, reviews, requested reviewers)
 */
export async function getPrExtendedInfo(
  prNumber: number,
  owner: string,
  repo: string
): Promise<{ commits: PrCommit[]; reviews: PrReview[]; requestedReviewers: string[] }> {
  return safeGhCommand(async () => {
    // Fetch commits, reviews, and requested reviewers in one call
    const result = await $`gh pr view ${prNumber} -R ${owner}/${repo} --json commits,reviews,reviewRequests`.json()

    const commits: PrCommit[] = (result.commits || []).map((c: any) => ({
      sha: c.oid.slice(0, 7),
      message: c.messageHeadline,
      author: c.authors?.[0]?.login || c.authors?.[0]?.name || "unknown",
      date: c.committedDate,
    })).reverse() // Newest first

    const reviews: PrReview[] = (result.reviews || []).map((r: any) => ({
      id: r.id,
      author: r.author?.login || "unknown",
      state: r.state as PrReview["state"],
      body: r.body || undefined,
      submittedAt: r.submittedAt,
    }))

    // Deduplicate reviews - keep only the latest review per author
    const latestReviews = new Map<string, PrReview>()
    for (const review of reviews) {
      const existing = latestReviews.get(review.author)
      if (!existing || (review.submittedAt && existing.submittedAt && review.submittedAt > existing.submittedAt)) {
        latestReviews.set(review.author, review)
      }
    }

    const requestedReviewers: string[] = (result.reviewRequests || []).map((r: any) => 
      r.login || r.name || "unknown"
    )

    return {
      commits,
      reviews: Array.from(latestReviews.values()),
      requestedReviewers,
    }
  })
}

/**
 * Fetch check runs for a PR (CI/CD status)
 */
export async function getPrChecks(
  owner: string,
  repo: string,
  headSha: string
): Promise<PrCheck[]> {
  return safeGhCommand(async () => {
    const result = await $`gh api repos/${owner}/${repo}/commits/${headSha}/check-runs`.json() as {
      total_count: number
      check_runs: any[]
    }

    return (result.check_runs || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status as PrCheck["status"],
      conclusion: c.conclusion as PrCheck["conclusion"],
      detailsUrl: c.details_url || c.html_url || null,
      startedAt: c.started_at || null,
      completedAt: c.completed_at || null,
    }))
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
    const reviews = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews`.json() as any[]
    
    // Find pending review by current user
    const pendingReview = reviews.find(
      (r: any) => r.state === "PENDING" && r.user?.login === currentUser
    )
    
    if (!pendingReview) {
      return null
    }

    // Fetch comments for this pending review
    const reviewComments = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews/${pendingReview.id}/comments`.json() as any[]

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
 * Thread info from GraphQL (for resolution state)
 */
interface GraphQLThreadInfo {
  id: string  // node_id for GraphQL mutations
  isResolved: boolean
  path: string
  line: number | null
  comments: {
    nodes: Array<{ databaseId: number }>
  }
}

/**
 * Fetch PR review threads via GraphQL (includes resolution state)
 */
async function getPrReviewThreads(
  owner: string,
  repo: string,
  prNumber: number
): Promise<GraphQLThreadInfo[]> {
  const query = `
    query($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              path
              line
              comments(first: 1) {
                nodes {
                  databaseId
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
  prNumber: number
): Promise<PrComment[]> {
  return safeGhCommand(async () => {
    // Fetch REST comments and GraphQL threads in parallel
    const [restComments, threads] = await Promise.all([
      $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments`.json() as Promise<any[]>,
      getPrReviewThreads(owner, repo, prNumber),
    ])
    
    // Build a map from first comment ID to thread info
    const threadByFirstCommentId = new Map<number, GraphQLThreadInfo>()
    for (const thread of threads) {
      const firstCommentId = thread.comments?.nodes?.[0]?.databaseId
      if (firstCommentId) {
        threadByFirstCommentId.set(firstCommentId, thread)
      }
    }

    return restComments.map((c: any) => {
      // Find thread info for this comment
      // If this is a root comment (no in_reply_to_id), check if it's in our map
      // If this is a reply, we'll inherit thread info from root later
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
      }
    })
  })
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
    const comments = await $`gh api repos/${owner}/${repo}/issues/${prNumber}/comments`.json() as any[]
    
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
    author: c.author, // Preserve original author
    inReplyTo: c.inReplyToId ? `gh-${c.inReplyToId}` : undefined,
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

  // Fetch all data in parallel (including viewed statuses and extended info)
  const [prInfo, diff, prComments, headSha, viewedStatuses, conversationComments, extendedInfo] = await Promise.all([
    getPrInfo(prNumber, resolvedOwner, resolvedRepo),
    getPrDiff(prNumber, resolvedOwner, resolvedRepo),
    getPrComments(resolvedOwner!, resolvedRepo!, prNumber),
    getPrHeadSha(prNumber, resolvedOwner, resolvedRepo),
    fetchViewedStatuses(resolvedOwner!, resolvedRepo!, prNumber),
    getPrConversationComments(resolvedOwner!, resolvedRepo!, prNumber),
    getPrExtendedInfo(prNumber, resolvedOwner!, resolvedRepo!),
  ])
  
  // Fetch checks (requires headSha from first batch)
  const checks = await getPrChecks(resolvedOwner!, resolvedRepo!, headSha)
  
  // Attach conversation comments, extended info, and checks to prInfo
  prInfo.conversationComments = conversationComments
  prInfo.commits = extendedInfo.commits
  prInfo.reviews = extendedInfo.reviews
  prInfo.requestedReviewers = extendedInfo.requestedReviewers
  prInfo.checks = checks

  // Build source identifier for this PR
  const prSource = `gh:${resolvedOwner}/${resolvedRepo}#${prNumber}`
  
  // Load existing local comments first
  const existingComments = await loadComments(prSource)
  
  // Build a set of GitHub IDs we're fetching (as numbers)
  const fetchedGithubIds = new Set<number>(prComments.map(c => c.id))
  
  // Convert GitHub comments and save/update them
  for (const prComment of prComments) {
    const comment = convertPrComment(prComment, headSha)
    await saveComment(comment, prSource)
  }
  
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
  for (const commentId of localCommentsToDelete) {
    await deleteCommentFile(commentId, prSource)
  }
  
  // Add newly fetched GitHub comments
  for (const prComment of prComments) {
    const comment = convertPrComment(prComment, headSha)
    comments.push(comment)
  }
  
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
  filename: string
): Promise<string | null> {
  return safeGhCommand(async () => {
    // Get the PR head SHA first
    const headSha = await getPrHeadSha(prNumber, owner, repo)
    
    // Fetch file content at that SHA
    const result = await $`gh api repos/${owner}/${repo}/contents/${filename}?ref=${headSha}`.json()
    
    if (result.encoding === "base64" && result.content) {
      // Decode base64 content
      return Buffer.from(result.content, "base64").toString("utf-8")
    }
    
    return null
  }).catch(() => null)
}

/**
 * Get the "old" version of a file (base branch version)
 */
export async function getPrBaseFileContent(
  owner: string,
  repo: string,
  prNumber: number,
  filename: string
): Promise<string | null> {
  return safeGhCommand(async () => {
    // Get the PR base ref (e.g., "main")
    const prInfo = await getPrInfo(prNumber, owner, repo)
    
    // Fetch file content at the base ref
    const result = await $`gh api repos/${owner}/${repo}/contents/${filename}?ref=${prInfo.baseRef}`.json()
    
    if (result.encoding === "base64" && result.content) {
      // Decode base64 content
      return Buffer.from(result.content, "base64").toString("utf-8")
    }
    
    return null
  }).catch(() => null)
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
 * Submit a single comment immediately to GitHub (like "Add single comment")
 */
export async function submitSingleComment(
  owner: string,
  repo: string,
  prNumber: number,
  comment: Comment,
  commitSha: string
): Promise<SubmitResult> {
  try {
    // Use -F for line (integer) and -f for strings
    // side must be uppercase: LEFT or RIGHT
    const result = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments \
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

/**
 * Fetch viewed statuses for all files in a PR via GraphQL.
 * Returns a map from filename to viewed boolean.
 */
export async function fetchViewedStatuses(
  owner: string,
  repo: string,
  prNumber: number
): Promise<Map<string, boolean>> {
  const query = `
    query($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          files(first: 100) {
            nodes {
              path
              viewerViewedState
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `
  
  const statuses = new Map<string, boolean>()
  
  try {
    const result = await $`gh api graphql -f query=${query} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber}`.json() as any
    const files = result?.data?.repository?.pullRequest?.files?.nodes || []
    
    for (const file of files) {
      // viewerViewedState: "VIEWED" | "UNVIEWED" | "DISMISSED"
      // Consider "VIEWED" as viewed, anything else as not viewed
      statuses.set(file.path, file.viewerViewedState === "VIEWED")
    }
    
    // Handle pagination for large PRs (100+ files)
    let pageInfo = result?.data?.repository?.pullRequest?.files?.pageInfo
    while (pageInfo?.hasNextPage && pageInfo?.endCursor) {
      const paginatedQuery = `
        query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              files(first: 100, after: $cursor) {
                nodes {
                  path
                  viewerViewedState
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `
      
      const nextResult = await $`gh api graphql -f query=${paginatedQuery} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber} -F cursor=${pageInfo.endCursor}`.json() as any
      const nextFiles = nextResult?.data?.repository?.pullRequest?.files?.nodes || []
      
      for (const file of nextFiles) {
        statuses.set(file.path, file.viewerViewedState === "VIEWED")
      }
      
      pageInfo = nextResult?.data?.repository?.pullRequest?.files?.pageInfo
    }
    
    return statuses
  } catch (err) {
    // Return empty map on error (fail gracefully)
    console.error("Failed to fetch viewed statuses:", err)
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
