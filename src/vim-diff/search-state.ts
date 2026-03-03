/**
 * SearchState - State for vim-style in-view search
 */

/**
 * A single match in the visual line mapping for incremental search
 */
export interface IncrementalSearchMatch {
  /** Visual line index (0-indexed) */
  line: number
  /** Start column in line (0-indexed) */
  startCol: number
  /** End column (exclusive) */
  endCol: number
  /** Filename this match is in (for file-scoped navigation) */
  filename?: string
}

/**
 * A match in the full file content (before mapping to visual lines)
 */
export interface FileSearchMatch {
  /** Filename */
  filename: string
  /** Line number in full file (1-indexed) */
  lineNum: number
  /** Start column (0-indexed) */
  startCol: number
  /** End column (exclusive) */
  endCol: number
}

/**
 * State for incremental search
 */
export interface SearchState {
  /** Whether search mode is active (typing in prompt) */
  active: boolean
  /** Search direction */
  direction: "forward" | "backward"
  
  /** Confirmed search pattern (what matches are based on) */
  pattern: string
  /** Compiled regex (null if invalid or empty) */
  regex: RegExp | null
  
  /** All matches in the current view (visual lines) */
  matches: IncrementalSearchMatch[]
  /** Index of current match (-1 if none) */
  currentMatchIndex: number
  
  /** Original cursor position (for cancel) */
  originalLine: number
  originalCol: number
  
  /** What user is typing (may differ from confirmed pattern during incremental search) */
  promptValue: string
  /** Error message (e.g., "Invalid regex") */
  error: string | null
  
  /** Whether file content is being loaded */
  loading: boolean
  
  /** Whether search wrapped around */
  wrapped: boolean
}

/**
 * Create initial/reset search state
 */
export function createSearchState(): SearchState {
  return {
    active: false,
    direction: "forward",
    pattern: "",
    regex: null,
    matches: [],
    currentMatchIndex: -1,
    originalLine: 0,
    originalCol: 0,
    promptValue: "",
    error: null,
    loading: false,
    wrapped: false,
  }
}

/**
 * Reset search state but preserve pattern (for n/N navigation)
 */
export function clearActiveSearch(state: SearchState): SearchState {
  return {
    ...state,
    active: false,
    promptValue: "",
    error: null,
    loading: false,
  }
}

/**
 * Clear all search state including pattern and highlights
 */
export function clearAllSearch(): SearchState {
  return createSearchState()
}
