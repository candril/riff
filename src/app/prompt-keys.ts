import type { RiffKeymap } from "./keymap"
import type { AppKeyContext } from "./key-context"
import { registerTreeFilterKeys } from "../features/file-tree/filter-keys"
import { registerSearchKeys } from "../features/search"

/**
 * The search prompt and the tree's filter prompt. Search outranks the tree
 * filter, so it registers second: later registration wins. The pending
 * text object (text-object-keys.ts) never competes with the tree filter:
 * it waits in the diff, and the filter only holds keys while the tree has
 * focus.
 */
export function registerPromptKeys(riffKeymap: RiffKeymap, ctx: AppKeyContext): () => void {
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
