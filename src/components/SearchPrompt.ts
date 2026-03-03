/**
 * SearchPrompt - Search input UI shown at the bottom of the diff view
 * 
 * Only shows the search pattern input. Match count is displayed in the StatusBar.
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import type { SearchState } from "../vim-diff/search-state"

export interface SearchPromptProps {
  searchState: SearchState
}

/**
 * Search prompt component - shows search input pattern
 * 
 * Display: "/pattern" or "?pattern"
 * Match count is shown in the StatusBar (right-aligned)
 */
export function SearchPrompt({ searchState }: SearchPromptProps) {
  // Don't render if no search activity
  if (!searchState.active && !searchState.pattern) {
    return Box({ height: 0 })
  }
  
  const prefix = searchState.direction === "forward" ? "/" : "?"
  
  // Determine color based on match status
  const hasNoMatches = searchState.matches.length === 0 && (searchState.promptValue || searchState.pattern)
  const promptColor = searchState.error 
    ? theme.red 
    : hasNoMatches
      ? theme.red 
      : theme.text
  
  // Build loading indicator
  const loadingIndicator = searchState.loading ? " Loading..." : ""
  
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: theme.surface0,
      flexDirection: "row",
      paddingLeft: 1,
    },
    
    // Search prompt with pattern
    Text({
      content: searchState.active
        ? `${prefix}${searchState.promptValue}`
        : `${prefix}${searchState.pattern}`,
      fg: promptColor,
    }),
    
    // Loading indicator
    loadingIndicator ? Text({
      content: loadingIndicator,
      fg: theme.subtext0,
    }) : null,
    
    // Error message
    searchState.error ? Text({
      content: ` ${searchState.error}`,
      fg: theme.red,
    }) : null,
  )
}
