import type { RiffKeymap } from "./keymap"
import type { GlobalKeyContext } from "./global-keys"
import { registerTreeFilterKeys } from "../features/file-tree/filter-keys"
import { registerSearchKeys } from "../features/search"

/**
 * The search prompt and the tree's filter prompt. The chain asked search
 * first, then its text object branch, then the tree filter, so the two
 * register in the reverse: later registration wins. The text object, which
 * stays in the chain, never competes with the tree filter: it waits in the
 * diff, and the filter only holds keys while the tree has focus.
 */
export function registerPromptKeys(riffKeymap: RiffKeymap, ctx: GlobalKeyContext): () => void {
  const unregisterTreeFilter = registerTreeFilterKeys(riffKeymap, {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    updatePanel: () => ctx.updateFileTreePanel(),
  })
  const unregisterSearch = registerSearchKeys(riffKeymap, {
    searchState: ctx.getSearchState,
    searchHandler: () => ctx.searchHandler,
  })
  return () => {
    unregisterTreeFilter()
    unregisterSearch()
  }
}
