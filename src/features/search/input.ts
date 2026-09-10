/**
 * Search input handling.
 *
 * The prompt captures all input while it is up, but only Enter and Escape
 * mean anything here: the pattern itself is typed into the shared prompt
 * field, which reports every change to `SearchHandler.updatePattern`
 * (specs 017, 065).
 */

import type { KeyEvent } from "@opentui/core"
import type { SearchState } from "../../vim-diff/search-state"
import type { SearchHandler } from "../../vim-diff/search-handler"

export interface SearchInputContext {
  readonly searchState: SearchState
  readonly searchHandler: SearchHandler
}

/**
 * Handle input when search prompt is active.
 * Returns true if the key was handled (search is active), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: SearchInputContext
): boolean {
  if (!ctx.searchState.active) {
    return false
  }

  switch (key.name) {
    case "escape":
      key.preventDefault()
      ctx.searchHandler.cancelSearch()
      return true

    case "return":
    case "enter":
      key.preventDefault()
      ctx.searchHandler.confirmSearch()
      return true

    default:
      // Everything else is typing, and belongs to the prompt field —
      // including Ctrl-w and the rest of the editing keys the widget
      // brings with it (spec 065).
      return true
  }
}
