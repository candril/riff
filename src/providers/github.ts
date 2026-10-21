import { $ } from "bun"
import { safeGhCommand, safeJson } from "./github/exec"
import type { PrCheckAnnotation } from "./github/types"
import type { TimelineEntry } from "../utils/feed"
import { readStack, type StackInfo } from "../utils/stack"

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
