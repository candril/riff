import type { SearchState } from "../vim-diff/search-state"
import { remainingRowLabels, type FlashState } from "../vim-diff/flash-state"

/** What the search row shows; match counts are the status bar's. */
export interface SearchPromptModel {
  prefix: "/" | "?"
  /** The field is drawn while typing; once confirmed, the pattern it left behind. */
  typing: boolean
  pattern: string
  tone: "normal" | "error"
  loading: boolean
  error: string | null
}

/** What flash's row shows: what has been typed and how many targets are live. */
export interface FlashPromptModel {
  pattern: string
  hint: string
  noMatches: boolean
}

export function searchPromptModel(searchState: SearchState): SearchPromptModel | null {
  if (!searchState.active && !searchState.pattern) return null
  const hasNoMatches =
    searchState.matches.length === 0 && (searchState.promptValue !== "" || searchState.pattern !== "")
  return {
    prefix: searchState.direction === "forward" ? "/" : "?",
    typing: searchState.active,
    pattern: searchState.pattern,
    tone: searchState.error || hasNoMatches ? "error" : "normal",
    loading: searchState.loading,
    error: searchState.error,
  }
}

export function flashPromptModel(flashState: FlashState): FlashPromptModel | null {
  if (!flashState.active) return null
  const targets =
    flashState.surface === "diff"
      ? flashState.matches.length
      : remainingRowLabels(flashState.rows, flashState.pattern).size
  const noMatches = flashState.pattern.length > 0 && targets === 0
  const hint = noMatches
    ? "no targets"
    : flashState.pattern.length > 0
      ? `${targets} target${targets === 1 ? "" : "s"}`
      : "type to jump"
  return { pattern: flashState.pattern, hint, noMatches }
}
