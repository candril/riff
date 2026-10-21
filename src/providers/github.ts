import { $ } from "bun"
import { extractShellError, getCurrentUser, safeGhCommand, safeJson } from "./github/exec"
import type { PendingReview, PrCheckAnnotation } from "./github/types"
import type { TimelineEntry } from "../utils/feed"
import { readStack, type StackInfo } from "../utils/stack"
import type { Comment } from "../types"

/** References resolved per GraphQL call — GitHub caps a query's node count. */
const REFERENCE_BATCH = 25

const MENTIONABLE_PAGES = 3

// ============================================================================
// GitHub API functions
// ============================================================================

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
    await $`gh api -X DELETE repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}`.quiet()
    return { success: true }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
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
    await $`gh pr edit ${prNumber} ${repoArgs} --title ${title} --body ${body}`.quiet()
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
 * Whether this PR's base is another open PR's branch, and how that base has
 * moved since this PR branched (spec 072). Three REST calls, only the first
 * of them for a PR that turns out not to be stacked.
 */
export async function fetchStackInfo(
  owner: string,
  repo: string,
  baseRef: string,
  headSha: string
): Promise<StackInfo | null> {
  // Best effort throughout: a stack that cannot be read is shown as no
  // stack, never as a failure to open the PR.
  const quiet = async <T,>(cmd: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await cmd()
    } catch {
      return fallback
    }
  }

  // Interpolated, not spelled inline: `&` in a template literal is the
  // shell's, and would background the call.
  const byHead = `repos/${owner}/${repo}/pulls?head=${owner}:${baseRef}&state=open`
  const basePrs = await quiet(async () => (await $`gh api ${byHead}`.json()) as any[], [])
  const basePr = basePrs[0]
  if (!basePr?.number || !basePr.head?.sha) return null

  const [compare, commits] = await Promise.all([
    quiet(
      async () =>
        (await $`gh api repos/${owner}/${repo}/compare/${basePr.head.sha}...${headSha}`.json()) as any,
      null
    ),
    quiet(
      async () => (await $`gh api --paginate repos/${owner}/${repo}/pulls/${basePr.number}/commits`.json()) as any[],
      []
    ),
  ])
  if (!compare?.merge_base_commit?.sha) return null

  return readStack(
    { number: basePr.number, title: basePr.title ?? "" },
    { behindBy: compare.behind_by ?? 0, mergeBase: compare.merge_base_commit.sha },
    commits.map((commit: any) => ({ sha: String(commit.sha ?? "") }))
  )
}

/**
 * The PR's timeline (spec 070): commits, reviews, force-pushes, renames,
 * ready-for-review — one paginated REST call, and the only source that
 * reports a force-push at all, which is why it is worth a request riff does
 * not otherwise make.
 */
export async function fetchPrTimeline(
  owner: string,
  repo: string,
  prNumber: number
): Promise<TimelineEntry[]> {
  return safeGhCommand(
    async () =>
      (await $`gh api --paginate repos/${owner}/${repo}/issues/${prNumber}/timeline`.json()) as TimelineEntry[]
  )
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
 * comment spanning `range.startLine`..`comment.line` inclusive.
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
/**
 * One comment as GitHub's review API wants it. A comment that spans lines
 * carries `start_line`, which is what makes a suggestion replace the block
 * it was written against rather than its last line (spec 076).
 */
function reviewComment(comment: Comment): Record<string, unknown> {
  const range = commentRange(comment)
  return {
    path: comment.filename,
    line: comment.line,
    side: comment.side,
    body: comment.body,
    ...(range ? { start_line: range.startLine, start_side: range.startSide } : {}),
  }
}

/**
 * The range a comment spans, or nothing when it is a single line. GitHub
 * rejects a range whose start is its end, so an equal pair is no range.
 */
export function commentRange(
  comment: Comment,
): { startLine: number; startSide: "LEFT" | "RIGHT" } | undefined {
  if (!comment.startLine || comment.startLine >= comment.line) return undefined
  return { startLine: comment.startLine, startSide: comment.side }
}

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
        const reviewComments = comments.map(reviewComment)
        
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
    const reviewComments = comments.map(reviewComment)
    
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
