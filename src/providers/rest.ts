/**
 * Conditional GETs against GitHub's REST API.
 *
 * Exists for one reason: `gh api` gives no access to response headers, so it
 * can't send `If-None-Match` or read an ETag back. That matters for anything
 * on a timer — a 304 costs nothing against the rate limit and skips both the
 * JSON transfer and the work of diffing an unchanged payload.
 *
 * Talks to the API directly with the token `gh` already holds, rather than
 * spawning a `gh` subprocess per request.
 */

import { $ } from "bun"

const API_ORIGIN = "https://api.github.com"

let cachedToken: string | null = null

/**
 * The token `gh auth login` stored. Cached for the process lifetime: shelling
 * out per request would defeat the point of skipping the subprocess.
 */
async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken
  const result = await $`gh auth token`.quiet().nothrow()
  if (result.exitCode !== 0) return null
  cachedToken = result.stdout.toString().trim() || null
  return cachedToken
}

/** ETags keyed by the caller's cache key, so distinct probes don't collide. */
const etags = new Map<string, string>()

export type ConditionalResult<T> =
  | { status: "unchanged" }
  | { status: "changed"; data: T }
  | { status: "error"; error: string }

/**
 * GET `path`, sending the ETag from the previous call for the same
 * `cacheKey`.
 *
 * A first call always reports "changed" — there's no ETag to compare against
 * yet, and treating an unprimed cache as unchanged would suppress the very
 * first update.
 */
export async function conditionalGet<T>(
  path: string,
  cacheKey: string,
): Promise<ConditionalResult<T>> {
  const token = await getToken()
  if (!token) return { status: "error", error: "no gh token" }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  }
  const previous = etags.get(cacheKey)
  if (previous) headers["If-None-Match"] = previous

  try {
    const response = await fetch(`${API_ORIGIN}/${path.replace(/^\//, "")}`, { headers })

    if (response.status === 304) return { status: "unchanged" }
    if (!response.ok) {
      return { status: "error", error: `HTTP ${response.status}` }
    }

    const etag = response.headers.get("etag")
    if (etag) etags.set(cacheKey, etag)

    return { status: "changed", data: (await response.json()) as T }
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Whether anything about a PR's review comments has changed since the last
 * check — a new comment, an edit, or a deletion.
 *
 * Sorting by `updated` descending is what makes a single-item page a valid
 * change detector: any create or edit bubbles to the top, so the first page's
 * ETag moves. Without the sort, new comments land on the *last* page (the
 * default order is ascending by creation) and page one would never budge.
 *
 * Thread *resolution* is deliberately not covered — resolving doesn't touch
 * any comment's `updated_at`. Callers must still check resolution separately;
 * this only tells them whether re-fetching the comment bodies is worthwhile.
 */
export async function reviewCommentsChanged(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ConditionalResult<unknown[]>> {
  return conditionalGet<unknown[]>(
    `repos/${owner}/${repo}/pulls/${prNumber}/comments?sort=updated&direction=desc&per_page=1`,
    `review-comments:${owner}/${repo}#${prNumber}`,
  )
}
