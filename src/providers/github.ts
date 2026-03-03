import { $ } from "bun"
import { saveComment, saveSession, loadComments, deleteCommentFile } from "../storage"
import type { Comment, ReviewSession } from "../types"

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
}

export interface PrCommit {
  sha: string        // Short SHA (7 chars)
  message: string    // First line of commit message
  author: string
  date: string       // ISO date
}

export interface PrReview {
  author: string
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "PENDING" | "DISMISSED"
  submittedAt?: string
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

    const result = await $`gh pr view ${prNumber} ${repoArgs} --json number,title,body,author,state,isDraft,headRefName,baseRefName,url,additions,deletions,changedFiles,createdAt,updatedAt`.json()

    // Get owner/repo if not provided
    let finalOwner = owner
    let finalRepo = repo
    if (!owner || !repo) {
      const current = await getCurrentRepo()
      finalOwner = current.owner
      finalRepo = current.repo
    }

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
      author: r.author?.login || "unknown",
      state: r.state as PrReview["state"],
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

  // Fetch all data in parallel (including viewed statuses)
  const [prInfo, diff, prComments, headSha, viewedStatuses] = await Promise.all([
    getPrInfo(prNumber, resolvedOwner, resolvedRepo),
    getPrDiff(prNumber, resolvedOwner, resolvedRepo),
    getPrComments(resolvedOwner!, resolvedRepo!, prNumber),
    getPrHeadSha(prNumber, resolvedOwner, resolvedRepo),
    fetchViewedStatuses(resolvedOwner!, resolvedRepo!, prNumber),
  ])

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
    // Extract more useful error message
    const errMsg = err instanceof Error ? err.message : String(err)
    // Try to parse JSON error from gh cli
    const jsonMatch = errMsg.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.message) {
          return { success: false, error: parsed.message }
        }
      } catch {
        // Ignore parse errors
      }
    }
    return {
      success: false,
      error: errMsg,
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
      error: err instanceof Error ? err.message : "Failed to submit reply",
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
    const errMsg = err instanceof Error ? err.message : String(err)
    // Try to parse JSON error from gh cli
    const jsonMatch = errMsg.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.message) {
          return { success: false, error: parsed.message }
        }
      } catch {
        // Ignore parse errors
      }
    }
    return {
      success: false,
      error: errMsg,
    }
  }
}

/**
 * Submit a review with multiple comments as a batch
 */
export async function submitReview(
  owner: string,
  repo: string,
  prNumber: number,
  comments: Comment[],
  commitSha: string,
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = "COMMENT",
  body: string = ""
): Promise<SubmitResult> {
  try {
    // Build review comments array
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
      error: err instanceof Error ? err.message : "Failed to submit review",
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
    const errMsg = err instanceof Error ? err.message : String(err)
    return { success: false, error: errMsg }
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
    const errMsg = err instanceof Error ? err.message : String(err)
    return { success: false, error: errMsg }
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
    
    await $`gh api graphql -f query=${mutation} -F prId=${prId} -F path=${path}`
    
    return { success: true }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { success: false, error: errMsg }
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
