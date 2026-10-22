import { createSignal } from "solid-js"

export type MentionsState = ReturnType<typeof createMentionsState>

/**
 * The @mention pool's state (spec 046): the GitHub users this repo accepts as
 * mentions, and the query being searched on GitHub. The feature owns it rather
 * than AppState, which sheds one slice per feature this way (spec 100, M6;
 * ADR-003). A reload does not reset it: the pool is the repo's roster, not the
 * diff's, and neither the startup prefetch nor a fragment's search is asked
 * again in the same session.
 */
export function createMentionsState() {
  const [pool, setPool] = createSignal<readonly string[]>([])
  const [searching, setSearching] = createSignal<string | null>(null)

  /**
   * Merging rather than replacing lets the background roster fetch and the
   * per-query searches land in either order without clobbering each other.
   */
  const merge = (logins: readonly string[]) => {
    const seen = new Set(pool().map((login) => login.toLowerCase()))
    const added = logins.filter((login) => !seen.has(login.toLowerCase()))
    if (added.length > 0) setPool([...pool(), ...added])
  }

  return {
    pool,
    /** The query being searched on GitHub, so a slow round-trip does not read as "no match". */
    searching,
    merge,
    searchStarted(query: string) {
      if (searching() !== query) setSearching(query)
    },
    searchSettled(query: string, logins: readonly string[]) {
      // Only clear the hint if it still belongs to this query — a newer
      // search may have started while this one was in flight.
      if (searching() === query) setSearching(null)
      merge(logins)
    },
  }
}
