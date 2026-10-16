import type { SplitSearch } from "../split-view/overlays"
import type { SearchState } from "../vim-diff/search-state"

// One per search state, so a render that left the search alone hands the island the same object.
const searches = new WeakMap<SearchState, SplitSearch>()

/** The search as either diff view draws it, null while nothing matches. */
export function searchOf(state: SearchState): SplitSearch | null {
  if (state.matches.length === 0) return null
  let known = searches.get(state)
  if (!known) {
    known = { matches: state.matches, current: state.currentMatchIndex }
    searches.set(state, known)
  }
  return known
}
