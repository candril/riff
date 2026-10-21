import { $ } from "bun"
import { extractShellError } from "./exec"

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
export async function fetchRemainingViewedStatuses(
  owner: string,
  repo: string,
  prNumber: number,
  cursor: string
): Promise<Map<string, ViewerViewedState>> {
  const statuses = new Map<string, ViewerViewedState>()

  try {
    while (true) {
      const result = await $`gh api graphql -f query=${VIEWED_STATUS_PAGE_QUERY} -F owner=${owner} -F repo=${repo} -F prNumber=${prNumber} -F cursor=${cursor}`.json() as any
      const files = result?.data?.repository?.pullRequest?.files

      for (const file of files?.nodes ?? []) {
        statuses.set(file.path, file.viewerViewedState)
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
