import { $ } from "bun"
import { saveComment, loadComments, deleteCommentFile } from "../../storage/comments"
import { saveSession } from "../../storage/session"
import { getCurrentRepo, safeGhCommand } from "./exec"
import { getPrDiff } from "./diff"
import { parseReactionGroups } from "./reactions"
import {
  convertPrComment,
  fetchRestReviewComments,
  mergeReviewComments,
  THREAD_COMMENTS_FULL,
  type GraphQLThreadInfo,
} from "./threads"
import { fetchRemainingViewedStatuses, type ViewerViewedState } from "./viewed"
import type { PrCheck, PrCommit, PrConversationComment, PrInfo, PrReview } from "./types"
import type { Comment, ReviewSession } from "../../types"

/**
 * How many commits the PR bundle asks for. Exported because a truncated
 * list can't answer "is this head still in the PR" — see `wasForcePushed`.
 */
export const PR_COMMITS_FETCH_LIMIT = 100

/**
 * Everything about a PR that lives behind GitHub's GraphQL `pullRequest` node:
 * its commits, reviews, reviewers, conversation, checks, threads and viewed
 * state come from this one query, so opening a PR costs one GraphQL
 * round-trip rather than a `gh` spawn per piece, several of which would fetch
 * the very same commits and reviews.
 */
const PR_BUNDLE_QUERY = `
  query($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        number title body state isDraft url
        additions deletions changedFiles createdAt updatedAt
        headRefName baseRefName headRefOid
        mergeable mergeStateStatus reviewDecision autoMergeRequest { mergeMethod }
        baseRef {
          branchProtectionRule { requiredApprovingReviewCount }
          rules(first: 20) { nodes { parameters {
            ... on PullRequestParameters { requiredApprovingReviewCount }
          } } }
        }
        author { login __typename }
        headRepository { name }
        headRepositoryOwner { login }
        reactionGroups { content viewerHasReacted reactors(first: 0) { totalCount } }
        commits(first: ${PR_COMMITS_FETCH_LIMIT}) {
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
              isRequired(pullRequestNumber: $prNumber)
            }
          } } } } }
        }
      }
    }
  }
`

interface PrBundle {
  /** Fully populated — commits, reviews, reviewers, conversation, checks, reactions. */
  prInfo: PrInfo
  headSha: string
  threads: GraphQLThreadInfo[]
  viewedStatuses: Map<string, ViewerViewedState>
}

async function fetchPrBundle(
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

    const prInfo = prInfoOf(pr, owner, repo)

    const viewedStatuses = new Map<string, ViewerViewedState>()
    for (const file of pr.files?.nodes ?? []) {
      viewedStatuses.set(file.path, file.viewerViewedState)
    }
    // PRs over 100 files are rare enough to pay a second round-trip for.
    const filesPageInfo = pr.files?.pageInfo
    if (filesPageInfo?.hasNextPage && filesPageInfo?.endCursor) {
      for (const [path, viewedState] of await fetchRemainingViewedStatuses(
        owner, repo, prNumber, filesPageInfo.endCursor
      )) {
        viewedStatuses.set(path, viewedState)
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

export function prInfoOf(pr: any, owner: string, repo: string): PrInfo {
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
      ...(typeof n.isRequired === "boolean" ? { isRequired: n.isRequired } : {}),
    }))
    // The rollup hands them back in its own order; newest-first is what the
    // panel has always shown.
    .sort((a: PrCheck, b: PrCheck) => b.id - a.id)

  return {
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
    mergeStateStatus: pr.mergeStateStatus ?? null,
    reviewDecision: pr.reviewDecision ?? null,
    autoMergeMethod: pr.autoMergeRequest?.mergeMethod?.toLowerCase() ?? null,
    mergeable: pr.mergeable ?? null,
    requiredApprovals: requiredApprovalsOf(pr.baseRef),
    commits,
    reviews,
    requestedReviewers,
    conversationComments,
    checks,
    bodyReactions: parseReactionGroups(pr.reactionGroups),
  }
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
 * Branch protection and every ruleset that targets the base all apply at
 * once, so the strictest count is the one a merge has to meet.
 */
function requiredApprovalsOf(baseRef: any): number | null {
  const counts = [
    baseRef?.branchProtectionRule?.requiredApprovingReviewCount,
    ...(baseRef?.rules?.nodes ?? []).map((rule: any) => rule?.parameters?.requiredApprovingReviewCount),
  ].filter((count): count is number => typeof count === "number")
  return counts.length > 0 ? Math.max(...counts) : null
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
): Promise<{ prInfo: PrInfo; diff: string; comments: Comment[]; viewedStatuses: Map<string, ViewerViewedState>; headSha: string }> {
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
