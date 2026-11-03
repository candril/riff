import { $ } from "bun"
import { extractShellError, safeGhCommand } from "./exec"
import type { Comment } from "../../types"
import type { MergeMethod } from "./types"

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

/**
 * Rewrite a PR-level comment — someone else's, too, given write access to
 * the repo. That is how a deploy bot's task-list button is pressed (spec 113).
 * The body travels as JSON on stdin: `-f` would read a leading `@` as a file.
 */
export async function updateIssueComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<SubmitResult> {
  try {
    const input = new Response(JSON.stringify({ body }))
    const result = await $`gh api -X PATCH repos/${owner}/${repo}/issues/comments/${commentId} --input - < ${input}`
      .quiet()
      .json() as { id: number; html_url: string }
    return { success: true, githubId: result.id, githubUrl: result.html_url }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
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

async function runGh(args: string[]): Promise<ReadyResult> {
  try {
    await $`${args}`.quiet()
    return { success: true }
  } catch (err) {
    return { success: false, error: extractShellError(err) }
  }
}

export function markPullRequestReady(owner: string, repo: string, prNumber: number): Promise<ReadyResult> {
  return runGh(readyCommand(owner, repo, prNumber, false))
}

export function markPullRequestDraft(owner: string, repo: string, prNumber: number): Promise<ReadyResult> {
  return runGh(readyCommand(owner, repo, prNumber, true))
}

export interface MergeOptions {
  method: MergeMethod
  deleteBranch: boolean
  /** Merges past the base's branch protection, as GitHub offers its admins. */
  admin: boolean
}

export type MergeResult = ReadyResult

export function mergeCommand(owner: string, repo: string, prNumber: number, { method, deleteBranch, admin }: MergeOptions): string[] {
  return [
    "gh", "pr", "merge", String(prNumber), "-R", `${owner}/${repo}`, `--${method}`,
    ...(deleteBranch ? ["--delete-branch"] : []),
    ...(admin ? ["--admin"] : []),
  ]
}

export function mergePullRequest(owner: string, repo: string, prNumber: number, options: MergeOptions): Promise<MergeResult> {
  return runGh(mergeCommand(owner, repo, prNumber, options))
}

export type UpdateMethod = "merge" | "rebase"

export function updateBranchCommand(owner: string, repo: string, prNumber: number, method: UpdateMethod): string[] {
  return ["gh", "pr", "update-branch", String(prNumber), "-R", `${owner}/${repo}`, ...(method === "rebase" ? ["--rebase"] : [])]
}

/** gh sends GraphQL's updatePullRequestBranch itself, so no node id is needed here. */
export function updatePullRequestBranch(owner: string, repo: string, prNumber: number, method: UpdateMethod): Promise<ReadyResult> {
  return runGh(updateBranchCommand(owner, repo, prNumber, method))
}

export function autoMergeCommand(owner: string, repo: string, prNumber: number, method: MergeMethod): string[] {
  return ["gh", "pr", "merge", String(prNumber), "-R", `${owner}/${repo}`, "--auto", `--${method}`]
}

export function disableAutoMergeCommand(owner: string, repo: string, prNumber: number): string[] {
  return ["gh", "pr", "merge", String(prNumber), "-R", `${owner}/${repo}`, "--disable-auto"]
}

/**
 * A base with a merge queue takes no strategy: gh queues the PR, or arms
 * auto-merge for the queue while its checks are still pending.
 */
export function enqueueCommand(owner: string, repo: string, prNumber: number): string[] {
  return ["gh", "pr", "merge", String(prNumber), "-R", `${owner}/${repo}`]
}

const DEQUEUE_MUTATION = "mutation($id: ID!) { dequeuePullRequest(input: {id: $id}) { clientMutationId } }"

/** gh has no command to take a PR out of its queue, so this goes to GraphQL by node id. */
export function dequeueCommand(nodeId: string): string[] {
  return ["gh", "api", "graphql", "-f", `query=${DEQUEUE_MUTATION}`, "-F", `id=${nodeId}`]
}

export function enableAutoMerge(owner: string, repo: string, prNumber: number, method: MergeMethod): Promise<ReadyResult> {
  return runGh(autoMergeCommand(owner, repo, prNumber, method))
}

export function disableAutoMerge(owner: string, repo: string, prNumber: number): Promise<ReadyResult> {
  return runGh(disableAutoMergeCommand(owner, repo, prNumber))
}

export function enqueuePullRequest(owner: string, repo: string, prNumber: number): Promise<ReadyResult> {
  return runGh(enqueueCommand(owner, repo, prNumber))
}

export function dequeuePullRequest(nodeId: string): Promise<ReadyResult> {
  return runGh(dequeueCommand(nodeId))
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
