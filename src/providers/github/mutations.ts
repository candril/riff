import { $ } from "bun"
import { extractShellError, safeGhCommand } from "./exec"
import type { Comment } from "../../types"

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
