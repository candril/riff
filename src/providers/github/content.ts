import { $ } from "bun"
import { describeGhFailure, safeGhCommand } from "./exec"
import type { FileContentResult } from "./types"

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
 * Get file content from a PR (the "new" version after changes)
 * Uses the PR's head commit SHA
 */
export async function getPrFileContent(
  owner: string,
  repo: string,
  prNumber: number,
  filename: string,
  headSha?: string
): Promise<FileContentResult> {
  try {
    // Resolving the head costs a `gh pr view` — a GraphQL call, on the quota
    // riff's pollers already lean on. Callers that loaded the diff know the
    // revision, so pass it and skip the round trip.
    const ref = headSha || (await getPrHeadSha(prNumber, owner, repo))
    return await getFileContentAtRef(owner, repo, filename, ref)
  } catch (error) {
    return { ok: false, error: await describeGhFailure(error) }
  }
}

/** A file as one revision has it. */
export async function getFileContentAtRef(
  owner: string,
  repo: string,
  filename: string,
  ref: string
): Promise<FileContentResult> {
  try {
    return decodeContentsResponse(
      await $`gh api repos/${owner}/${repo}/contents/${filename}?ref=${ref}`.json(),
      filename
    )
  } catch (error) {
    return { ok: false, error: await describeGhFailure(error) }
  }
}

const commitParentCache = new Map<string, Promise<string>>()

/**
 * The commit a commit was built on, memoized for the session. Asked of the
 * listing rather than the commit itself, whose response carries every file
 * the commit touched.
 */
export function getCommitParentSha(owner: string, repo: string, sha: string): Promise<string> {
  const key = `${owner}/${repo}@${sha}`
  const cached = commitParentCache.get(key)
  if (cached) return cached

  const pending = $`gh api repos/${owner}/${repo}/commits?sha=${sha}&per_page=1`
    .json()
    .then((result: any) => {
      const parent = result?.[0]?.parents?.[0]?.sha
      if (typeof parent !== "string") throw new Error(`No parent commit for ${sha}`)
      return parent
    })
    .catch((err) => {
      commitParentCache.delete(key)
      throw err
    })
  commitParentCache.set(key, pending)
  return pending
}

const baseRefCache = new Map<string, Promise<string>>()

/**
 * The PR's base branch, memoized for the session. Only the fallback for a
 * caller that has no `baseRef` to hand — a PR can't change base under a
 * running review without a refresh.
 */
function getPrBaseRef(owner: string, repo: string, prNumber: number): Promise<string> {
  const key = `${owner}/${repo}#${prNumber}`
  const cached = baseRefCache.get(key)
  if (cached) return cached

  const pending = $`gh pr view ${prNumber} -R ${owner}/${repo} --json baseRefName`
    .json()
    .then((result: any) => result.baseRefName as string)
    .catch((err) => {
      baseRefCache.delete(key)
      throw err
    })
  baseRefCache.set(key, pending)
  return pending
}

/**
 * Get the "old" version of a file (base branch version)
 */
export async function getPrBaseFileContent(
  owner: string,
  repo: string,
  prNumber: number,
  filename: string,
  baseRef?: string,
  headSha?: string
): Promise<FileContentResult> {
  try {
    const ref = await baseVersionRef(owner, repo, prNumber, baseRef, headSha)
    return await getFileContentAtRef(owner, repo, filename, ref)
  } catch (error) {
    return { ok: false, error: await describeGhFailure(error) }
  }
}

/**
 * The revision the PR's old side is written against: where head and base
 * last met, rather than where the base branch has since got to. The diff
 * counts its old line numbers from there, so a base that has moved on — or
 * that has taken the same change by another route — serves a file those
 * numbers do not fit.
 */
export async function baseVersionRef(
  owner: string,
  repo: string,
  prNumber: number,
  baseRef?: string,
  headSha?: string
): Promise<string> {
  const base = baseRef || (await getPrBaseRef(owner, repo, prNumber))
  try {
    const head = headSha || (await getPrHeadSha(prNumber, owner, repo))
    return await getPrMergeBase(owner, repo, prNumber, base, head)
  } catch {
    // A comparison the API won't serve leaves the branch: wrong wherever
    // the two have diverged since, right for a base that has not moved,
    // and either way better than no old side at all.
    return base
  }
}

const mergeBaseCache = new Map<string, Promise<string>>()

/** Where head and base last met, memoized for the session. */
function getPrMergeBase(
  owner: string,
  repo: string,
  prNumber: number,
  baseRef: string,
  headSha: string
): Promise<string> {
  const key = `${owner}/${repo}#${prNumber}:${baseRef}...${headSha}`
  const cached = mergeBaseCache.get(key)
  if (cached) return cached

  // Only the merge base is wanted; the commits and files the comparison
  // also carries are the bulk of a response riff would throw away.
  const pending = $`gh api repos/${owner}/${repo}/compare/${baseRef}...${headSha}?per_page=1`
    .json()
    .then((result: any) => {
      const sha = result?.merge_base_commit?.sha
      if (typeof sha !== "string") throw new Error(`No merge base for ${baseRef}...${headSha}`)
      return sha
    })
    .catch((err) => {
      mergeBaseCache.delete(key)
      throw err
    })
  mergeBaseCache.set(key, pending)
  return pending
}

interface ContentsResponse {
  encoding?: string
  content?: string
}

function decodeContentsResponse(
  result: ContentsResponse,
  filename: string
): FileContentResult {
  if (result.encoding === "base64" && result.content) {
    return { ok: true, content: Buffer.from(result.content, "base64").toString("utf-8") }
  }
  // Blobs over 1 MB come back with an empty body and encoding "none"; the
  // contents API can't serve them at all.
  return { ok: false, error: `GitHub returned no content for ${filename}` }
}
