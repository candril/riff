import { $ } from "bun"
import { safeGhCommand, safeJson } from "./exec"
import type { PrCheckAnnotation } from "./types"
import type { TimelineEntry } from "../../utils/feed"
import { readStack, type StackInfo } from "../../utils/stack"

/** References resolved per GraphQL call — GitHub caps a query's node count. */
const REFERENCE_BATCH = 25

export interface PrSummary {
  title: string
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  author: string | null
}

/** By "owner/repo"; null where the repository or the PR is not there, or not visible. */
export type PrLookups = Map<string, PrSummary | null>

/**
 * One PR number in many repositories, in one query (spec 112). `repos` come
 * from config and from what was typed, hence JSON.stringify on the way into
 * the query text.
 */
export async function lookupPrs(repos: readonly { owner: string; repo: string }[], number: number): Promise<PrLookups> {
  const fields = repos.map(
    ({ owner, repo }, i) =>
      `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { pullRequest(number: ${number}) { title state isDraft author { login } } }`
  )
  // gh exits non-zero as soon as one alias is not found, with the others on
  // stdout, and being not found is an answer here. So stdout decides.
  const result = await $`gh api graphql -f query=${`query { ${fields.join(" ")} }`}`.quiet().nothrow()
  return readPrLookups(result.stdout.toString(), result.stderr.toString(), repos)
}

export function readPrLookups(stdout: string, stderr: string, repos: readonly { owner: string; repo: string }[]): PrLookups {
  const parsed = safeJson(stdout) as {
    data?: Record<string, { pullRequest?: { title: string; state: PrSummary["state"]; isDraft: boolean; author: { login: string } | null } | null } | null> | null
    errors?: { message?: string }[]
  } | null
  if (!parsed?.data) {
    const reason = parsed?.errors?.[0]?.message ?? stderr.split("\n").find((line) => line.trim())?.trim()
    throw new Error(reason ?? "GitHub did not answer")
  }
  const lookups: PrLookups = new Map()
  repos.forEach(({ owner, repo }, i) => {
    const pr = parsed.data![`r${i}`]?.pullRequest
    lookups.set(
      `${owner}/${repo}`,
      pr ? { title: pr.title, state: pr.state, isDraft: pr.isDraft, author: pr.author?.login ?? null } : null
    )
  })
  return lookups
}

export interface IssueCommentSnapshot {
  body: string
  updatedAt: string
}

/**
 * One PR-level comment as it is now. REST, so watching a deploy bot's
 * comment every few seconds costs none of the GraphQL points (spec 113).
 */
export async function fetchIssueComment(
  owner: string,
  repo: string,
  commentId: number,
): Promise<IssueCommentSnapshot> {
  return safeGhCommand(async () => {
    const result = await $`gh api repos/${owner}/${repo}/issues/comments/${commentId}`.quiet().json() as {
      body?: string
      updated_at?: string
    }
    return { body: result.body ?? "", updatedAt: result.updated_at ?? "" }
  })
}

export interface RunJob {
  name: string
  status: string
  conclusion: string | null
  url: string
}

/** The jobs of one Actions run, as they stand (spec 113). */
export async function fetchRunJobs(owner: string, repo: string, runId: string): Promise<RunJob[]> {
  return safeGhCommand(async () => {
    const result = await $`gh api repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`.quiet().json() as {
      jobs?: { name?: string; status?: string; conclusion?: string | null; html_url?: string }[]
    }
    return (result.jobs ?? []).map((job) => ({
      name: job.name ?? "",
      status: job.status ?? "",
      conclusion: job.conclusion ?? null,
      url: job.html_url ?? "",
    }))
  })
}

/**
 * Fetch annotations for a single check run (spec 043).
 */
export async function getPrCheckAnnotations(
  owner: string,
  repo: string,
  checkRunId: number,
): Promise<PrCheckAnnotation[]> {
  return safeGhCommand(async () => {
    const result = await $`gh api repos/${owner}/${repo}/check-runs/${checkRunId}/annotations --paginate`.json() as any[]
    return annotationsOf(Array.isArray(result) ? result : [])
  })
}

/**
 * The annotations of one check run as riff shows them. Capped at 100
 * entries post-filter so a pathological build can't balloon memory.
 */
export function annotationsOf(raw: unknown[]): PrCheckAnnotation[] {
  const mapped: PrCheckAnnotation[] = []
  // Dedupe within a single check — matrix builds (e.g. .NET's multiple
  // target frameworks) fire the same compiler annotation once per
  // build pass. The user still sees the error N times if N checks
  // fail, which is what they want; we only collapse *within* a check.
  const seen = new Set<string>()
  for (const a of raw as any[]) {
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
}

// Best effort: what cannot be read is shown as not known, never as a failure
// to open the PR.
const quiet = async <T,>(cmd: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await cmd()
  } catch {
    return fallback
  }
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
 * How many commits the base has that the PR's head lacks (spec 108). One REST
 * compare on load and refresh: the bundle query has no field for it.
 */
export async function fetchBehindBy(
  owner: string,
  repo: string,
  baseRef: string,
  headSha: string
): Promise<number | "failed"> {
  // The head is "" until it is known, and a compare against nothing would
  // only spend a call on an error.
  if (!headSha) return "failed"
  const behind = await quiet(
    async () => behindByOf(await $`gh api repos/${owner}/${repo}/compare/${baseRef}...${headSha}`.quiet().json()),
    null
  )
  return behind ?? "failed"
}

export function behindByOf(compare: unknown): number | null {
  const behind = (compare as { behind_by?: unknown } | null)?.behind_by
  return typeof behind === "number" && Number.isInteger(behind) && behind >= 0 ? behind : null
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
