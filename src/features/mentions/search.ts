/**
 * Per-query @mention search.
 *
 * The background roster fetch caps out at a few hundred users, which is a
 * prefix of what a large org has — so typing `@koeck` can come up empty even
 * though the account exists. When the local pool can't fill the picker, ask
 * GitHub for that specific fragment and merge whatever comes back into the
 * pool, where the picker's own fuzzy filter picks it up.
 *
 * Debounced, and each fragment is only ever asked once per session.
 */

import { searchMentionableUsers } from "../../providers/github/mentions"
import { getFilteredMentionCandidates } from "../../components/thread-panel-picker"
import { MENTION_VISIBLE_LIMIT } from "../../components/at-picker"
import { getActiveMentionRepo } from "./prefetch"
import type { MentionsState } from "./state"

// Long enough that a fragment is worth a round-trip, short enough to still
// cover surnames people type in full.
const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 250

let pending: ReturnType<typeof setTimeout> | null = null
const attempted = new Set<string>()

export interface MentionSearchContext {
  mentions: Pick<MentionsState, "searchStarted" | "searchSettled">
  render: () => void
}

/**
 * Called on every keystroke inside an `@<query>` trigger. Cheap and
 * synchronous: it decides whether a search is warranted and schedules it.
 */
export function requestMentionSearch(
  ctx: MentionSearchContext,
  query: string,
  candidates: readonly string[],
): void {
  if (query.length < MIN_QUERY_LENGTH) return

  const key = query.toLowerCase()
  if (attempted.has(key)) return

  // The picker only shows MENTION_VISIBLE_LIMIT rows — if the local pool
  // already fills them, a search can't improve what the user sees.
  if (getFilteredMentionCandidates(candidates, query).length >= MENTION_VISIBLE_LIMIT) {
    return
  }

  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    // Marked here rather than at schedule time so a superseded debounce
    // doesn't burn the fragment without ever asking.
    attempted.add(key)
    void run(ctx, query)
  }, DEBOUNCE_MS)
}

async function run(ctx: MentionSearchContext, query: string): Promise<void> {
  const repo = getActiveMentionRepo()
  if (!repo) return

  ctx.mentions.searchStarted(query)
  ctx.render()

  const logins = await searchMentionableUsers(repo.owner, repo.repo, query).catch(
    () => [] as string[],
  )

  ctx.mentions.searchSettled(query, logins)
  ctx.render()
}
