/**
 * SearchPrompt - Search input UI shown at the bottom of the diff view
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import type { SearchState } from "../vim-diff/search-state"

export interface SearchPromptProps {
  searchState: SearchState
}

/**
 * Search prompt component - shows search input and match info
 * 
 * Display modes:
 * - Active search: "/pattern" or "?pattern" with cursor
 * - After search: "[1/N]" match count
 * - No matches: "[No matches]" in red
 * - Wrapped: Shows "Wrapped" indicator briefly
 */
export function SearchPrompt({ searchState }: SearchPromptProps) {
  // Don't render if no search activity
  if (!searchState.active && !searchState.pattern) {
    return Box({ height: 0 })
  }
  
  const prefix = searchState.direction === "forward" ? "/" : "?"
  
  // Build match info string
  let matchInfo = ""
  if (searchState.matches.length > 0) {
    const currentMatch = searchState.currentMatchIndex + 1
    matchInfo = `[${currentMatch}/${searchState.matches.length}]`
  } else if (searchState.promptValue || searchState.pattern) {
    matchInfo = "[No matches]"
  }
  
  // Build wrap indicator
  const wrapIndicator = searchState.wrapped ? " (Wrapped)" : ""
  
  // Build loading indicator
  const loadingIndicator = searchState.loading ? " Loading..." : ""
  
  // Determine colors
  const promptColor = searchState.error 
    ? theme.red 
    : (searchState.matches.length === 0 && searchState.promptValue) 
      ? theme.red 
      : theme.text
  
  const matchColor = searchState.matches.length === 0 
    ? theme.red 
    : theme.subtext0
  
  const wrapColor = theme.yellow
  
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: theme.surface0,
      flexDirection: "row",
      paddingX: 1,
    },
    
    // Search prompt with pattern
    Text({
      content: searchState.active
        ? `${prefix}${searchState.promptValue}`
        : `${prefix}${searchState.pattern}`,
      fg: promptColor,
    }),
    
    // Match count
    matchInfo ? Text({
      content: ` ${matchInfo}`,
      fg: matchColor,
    }) : null,
    
    // Wrap indicator
    wrapIndicator ? Text({
      content: wrapIndicator,
      fg: wrapColor,
    }) : null,
    
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
