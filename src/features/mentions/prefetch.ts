/**
 * Background fetch of the repo's @mention pool.
 *
 * The picker's own list is derived from loaded PR data (author, reviewers,
 * participants), which misses anyone who hasn't touched the PR yet — the
 * usual case when you want to pull a colleague in. GitHub's comment box
 * autocompletes from `repository.mentionableUsers`, so riff fetches the same
 * list once per session and merges it in behind the participants.
 *
 * Everything here is best-effort and silent: `collectMentionCandidates` runs
 * synchronously on every render, so the result has to land in state rather
 * than be awaited, and a failed fetch just leaves the picker as it is today.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github"
import { mergeMentionableUsers } from "../../state"
import { getMentionableUsers } from "../../providers/github"
import {
  getCurrentRepoInfo,
  loadMentionableUsers,
  saveMentionableUsers,
} from "../../storage"

/**
 * Repo the session's mentions resolve against, remembered so the per-query
 * search doesn't have to re-derive it on every keystroke.
 */
let activeRepo: { owner: string; repo: string } | null = null

export function getActiveMentionRepo(): { owner: string; repo: string } | null {
  return activeRepo
}

export interface MentionPrefetchContext {
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  mode: "local" | "pr"
  prInfo: PrInfo | null
}

/**
 * Kick off the prefetch. Returns immediately; the candidate list appears
 * whenever the cache read (fast) and the network fetch (slow) resolve.
 */
export function startMentionPrefetch(ctx: MentionPrefetchContext): void {
  void prefetch(ctx).catch(() => {
    // Nothing to recover — the picker keeps working off PR participants.
  })
}

async function prefetch(ctx: MentionPrefetchContext): Promise<void> {
  const repo = await resolveRepo(ctx)
  if (!repo) return
  activeRepo = repo

  const cached = await loadMentionableUsers(repo.owner, repo.repo)
  if (cached) {
    apply(ctx, cached.logins)
    if (!cached.stale) return
  }

  const logins = await getMentionableUsers(repo.owner, repo.repo)
  if (logins.length === 0) return

  apply(ctx, logins)
  await saveMentionableUsers(repo.owner, repo.repo, logins)
}

function apply(ctx: MentionPrefetchContext, logins: string[]): void {
  ctx.setState((s) => mergeMentionableUsers(s, logins))
  ctx.render()
}

/**
 * Which repo's roster to fetch. PR mode uses the base repo — a fork PR is
 * still commented on there, so that's the pool GitHub resolves mentions
 * against. Local mode falls back to whatever repo the cwd belongs to.
 */
async function resolveRepo(
  ctx: MentionPrefetchContext,
): Promise<{ owner: string; repo: string } | null> {
  if (ctx.mode === "pr" && ctx.prInfo) {
    return { owner: ctx.prInfo.owner, repo: ctx.prInfo.repo }
  }
  return getCurrentRepoInfo()
}
