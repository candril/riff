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
 * Posts at once, like GitHub's "Add single comment", outside any review.
 * With `range` it spans `range.startLine`..`comment.line` inclusive.
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
 * A PR-level comment, the kind the conversation tab shows. GitHub files those
 * under the PR's issue, so it goes through the issues API, not the pulls one.
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

interface DeleteResult {
  success: boolean
  error?: string
}

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

/**
 * `gh pr ready`'s arguments, which the confirm dialog shows as they are, so
 * the reader sees exactly what runs.
 */
export function readyCommand(owner: string, repo: string, prNumber: number, toDraft: boolean): string[] {
  return ["gh", "pr", "ready", String(prNumber), "-R", `${owner}/${repo}`, ...(toDraft ? ["--undo"] : [])]
}

export type ReadyResult = { success: true } | { success: false; error: string }

async function runReady(args: string[]): Promise<ReadyResult> {
  try {
    await $`${args}`.quiet()
    return { success: true }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

export function markPullRequestReady(owner: string, repo: string, prNumber: number): Promise<ReadyResult> {
  return runReady(readyCommand(owner, repo, prNumber, false))
}

export function markPullRequestDraft(owner: string, repo: string, prNumber: number): Promise<ReadyResult> {
  return runReady(readyCommand(owner, repo, prNumber, true))
}

interface CreatePrResult {
  prNumber: number
  url: string
}

/**
 * Uses `gh pr create` because it pushes the branch first when needed.
 */
export async function createPullRequest(
  title: string,
  body: string,
  draft: boolean = false
): Promise<CreatePrResult> {
  return safeGhCommand(async () => {
    const draftArgs = draft ? ["--draft"] : []
    const result = await $`gh pr create --title ${title} --body ${body} ${draftArgs} --json number,url`.json()
    return {
      prNumber: result.number,
      url: result.url,
    }
  })
}
