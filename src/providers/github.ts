import { $ } from "bun"
import { saveComment, saveSession } from "../storage"
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
  headRef: string // Branch name
  baseRef: string // Target branch (e.g., "main")
  owner: string
  repo: string
  url: string
  additions: number
  deletions: number
  changedFiles: number
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
      throw new Error("Not in a git repository. Specify full repo: neoriff gh:owner/repo#123")
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
 * Fetch PR metadata
 */
export async function getPrInfo(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<PrInfo> {
  return safeGhCommand(async () => {
    const repoArgs = owner && repo ? ["-R", `${owner}/${repo}`] : []

    const result = await $`gh pr view ${prNumber} ${repoArgs} --json number,title,body,author,state,headRefName,baseRefName,url,additions,deletions,changedFiles`.json()

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
      headRef: result.headRefName,
      baseRef: result.baseRefName,
      owner: finalOwner!,
      repo: finalRepo!,
      url: result.url,
      additions: result.additions,
      deletions: result.deletions,
      changedFiles: result.changedFiles,
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
 * Fetch PR review comments (inline comments on diff)
 */
export async function getPrComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrComment[]> {
  return safeGhCommand(async () => {
    const result = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments`.json()

    return (result as any[]).map((c: any) => ({
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
): Promise<{ prInfo: PrInfo; diff: string; comments: Comment[] }> {
  // Resolve owner/repo first if needed
  let resolvedOwner = owner
  let resolvedRepo = repo
  if (!owner || !repo) {
    const current = await getCurrentRepo()
    resolvedOwner = current.owner
    resolvedRepo = current.repo
  }

  // Fetch all data in parallel
  const [prInfo, diff, prComments, headSha] = await Promise.all([
    getPrInfo(prNumber, resolvedOwner, resolvedRepo),
    getPrDiff(prNumber, resolvedOwner, resolvedRepo),
    getPrComments(resolvedOwner!, resolvedRepo!, prNumber),
    getPrHeadSha(prNumber, resolvedOwner, resolvedRepo),
  ])

  // Convert and save each comment as markdown file
  const comments: Comment[] = []
  for (const prComment of prComments) {
    const comment = convertPrComment(prComment, headSha)
    await saveComment(comment)
    comments.push(comment)
  }

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

  return { prInfo, diff, comments }
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
