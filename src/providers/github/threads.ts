import { $ } from "bun"
import { extractShellError, safeGhCommand } from "./exec"
import { parseReactionGroups, type RawReactionGroup } from "./reactions"
import type { PrComment, PrConversationComment } from "./types"
import type { Comment, ReactionSummary } from "../../types"

/**
 * Thread info from GraphQL (for resolution state + reactions).
 * We pull every comment in the thread (not just the root) so reactions can
 * be attached to replies too (spec 042).
 */
export interface GraphQLThreadInfo {
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

/**
 * How many comments per thread to pull reactions for.
 *
 * This number is the single biggest lever on riff's GraphQL budget. GitHub
 * prices a query by its *nested* node count — `reviewThreads(first:100)` x
 * `comments(first:N)` costs roughly `100 * N / 100` points — so the depth
 * here multiplies straight into the hourly 5000-point quota. Measured
 * against a real PR: N=50 costs 51 points, N=1 costs 2.
 */
export const THREAD_COMMENTS_FULL = 50

/**
 * Depth for the background poller, which runs on a timer and would otherwise
 * spend the whole quota on its own. Root comments still carry reactions;
 * replies come back without them, so `mergeComments` keeps whatever the
 * previous full fetch already established.
 */
export const THREAD_COMMENTS_PROBE = 1

/**
 * Fetch PR review threads via GraphQL (includes resolution state + reactions)
 */
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

/**
 * Convert a GitHub PR comment to our Comment type
 */
export function convertPrComment(c: PrComment, prHeadSha: string): Comment {
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
