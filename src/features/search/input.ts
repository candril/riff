/**
 * Search input handling.
 *
 * The search prompt captures all input when active. It delegates to
 * the SearchHandler for actual search logic.
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
      ctx.searchHandler.cancelSearch()
      return true

    case "return":
    case "enter":
      ctx.searchHandler.confirmSearch()
      return true

    case "backspace":
      ctx.searchHandler.handleBackspace()
      return true

    default:
      // Ctrl+W deletes word backwards
      if (key.name === "w" && key.ctrl) {
        ctx.searchHandler.handleDeleteWord()
        return true
      }
      // Type characters into search
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        ctx.searchHandler.handleCharInput(key.sequence)
      }
      return true
  }
}
