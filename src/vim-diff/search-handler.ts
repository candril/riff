/**
 * SearchHandler - Orchestrates search operations between engine, state, and UI
 * 
 * Key responsibilities:
 * - Start/stop search mode
 * - Handle incremental search updates
 * - Navigate between matches
 * - Auto-expand dividers when navigating to matches outside hunks
 */

import type { VimCursorState } from "./types"
import type { DiffLineMapping } from "./line-mapping"
import type { SearchState, IncrementalSearchMatch } from "./search-state"
import { createSearchState, clearActiveSearch } from "./search-state"
import { SearchEngine } from "./search-engine"

export interface SearchHandlerOptions {
  getMapping: () => DiffLineMapping
  getSearchState: () => SearchState
  setSearchState: (state: SearchState) => void
  getCursor: () => VimCursorState
  setCursor: (line: number, col: number) => void
  // File content loading
  getFileContent: (filename: string) => string | null
  loadFileContent: (filename: string) => Promise<void>
  // Divider expansion
  expandDividerForLine: (filename: string, lineNum: number) => void
  // Re-render
  onUpdate: () => void
}

export class SearchHandler {
  private engine: SearchEngine
  
  constructor(private opts: SearchHandlerOptions) {
    this.engine = new SearchEngine(
      opts.getMapping,
      opts.getFileContent
    )
  }

  /**
   * Start search mode
   */
  startSearch(direction: "forward" | "backward"): void {
    const cursor = this.opts.getCursor()
    
    this.opts.setSearchState({
      ...createSearchState(),
      active: true,
      direction,
      originalLine: cursor.line,
      originalCol: cursor.col,
    })
    
    this.opts.onUpdate()
  }

  /**
   * Update search pattern as user types (incremental search)
   */
  updatePattern(pattern: string): void {
    const state = this.opts.getSearchState()
    const cursor = this.opts.getCursor()
    
    // Compile pattern
    const regex = this.engine.compilePattern(pattern)
    
    // Find all matches in the current mapping
    const matches = regex 
      ? this.engine.findAllMatchesInMapping(regex)
      : []
    
    // Find first match from original position
    let currentMatchIndex = -1
    let cursorLine = state.originalLine
    let cursorCol = state.originalCol
    let wrapped = false
    
    if (matches.length > 0) {
      const result = this.engine.findNextMatch(
        matches,
        state.originalLine,
        state.originalCol,
        state.direction
      )
      currentMatchIndex = result.index
      wrapped = result.wrapped
      
      if (result.match) {
        cursorLine = result.match.line
        cursorCol = result.match.startCol
      }
    }
    
    this.opts.setSearchState({
      ...state,
      promptValue: pattern,
      pattern,
      regex,
      matches,
      currentMatchIndex,
      wrapped,
      error: null,
    })
    
    // Move cursor to first match during incremental search
    if (matches.length > 0 && currentMatchIndex >= 0) {
      this.opts.setCursor(cursorLine, cursorCol)
    }
    
    this.opts.onUpdate()
  }

  /**
   * Confirm search (Enter)
   */
  confirmSearch(): void {
    const state = this.opts.getSearchState()
    
    this.opts.setSearchState({
      ...state,
      active: false,
      promptValue: "",
    })
    
    this.opts.onUpdate()
  }

  /**
   * Cancel search (Escape while typing)
   */
  cancelSearch(): void {
    const state = this.opts.getSearchState()
    
    // Restore cursor to original position
    this.opts.setCursor(state.originalLine, state.originalCol)
    
    // Clear search state entirely (no highlights)
    this.opts.setSearchState(createSearchState())
    
    this.opts.onUpdate()
  }

  /**
   * Clear search highlights (Escape in normal mode)
   */
  clearSearch(): void {
    this.opts.setSearchState(createSearchState())
    this.opts.onUpdate()
  }

  /**
   * Jump to next/previous match (n/N)
   */
  jumpToMatch(direction: "next" | "prev"): void {
    const state = this.opts.getSearchState()
    const cursor = this.opts.getCursor()
    
    if (!state.pattern || state.matches.length === 0) {
      return
    }
    
    // Determine effective direction based on original search direction
    // n repeats in same direction, N goes opposite
    const effectiveDirection = direction === "next"
      ? state.direction
      : (state.direction === "forward" ? "backward" : "forward")
    
    // Find next match from current cursor position
    const result = this.engine.findNextMatch(
      state.matches,
      cursor.line,
      cursor.col,
      effectiveDirection
    )
    
    if (result.match) {
      this.opts.setCursor(result.match.line, result.match.startCol)
      
      this.opts.setSearchState({
        ...state,
        currentMatchIndex: result.index,
        wrapped: result.wrapped,
      })
      
      this.opts.onUpdate()
    }
  }

  /**
   * Search for word under cursor (* or #)
   */
  searchWordUnderCursor(direction: "forward" | "backward"): void {
    const cursor = this.opts.getCursor()
    const word = this.engine.getWordUnderCursor(cursor.line, cursor.col)
    
    if (!word) {
      return
    }
    
    // Start search with the word (with word boundaries for exact match)
    const pattern = word
    const regex = this.engine.compilePattern(pattern)
    const matches = regex 
      ? this.engine.findAllMatchesInMapping(regex)
      : []
    
    // Find first match in the given direction
    let currentMatchIndex = -1
    let cursorLine = cursor.line
    let cursorCol = cursor.col
    let wrapped = false
    
    if (matches.length > 0) {
      const result = this.engine.findNextMatch(
        matches,
        cursor.line,
        cursor.col,
        direction
      )
      currentMatchIndex = result.index
      wrapped = result.wrapped
      
      if (result.match) {
        cursorLine = result.match.line
        cursorCol = result.match.startCol
      }
    }
    
    this.opts.setSearchState({
      ...createSearchState(),
      active: false,  // Not in input mode
      direction,
      pattern,
      regex,
      matches,
      currentMatchIndex,
      wrapped,
      originalLine: cursor.line,
      originalCol: cursor.col,
    })
    
    // Move cursor to match
    if (matches.length > 0 && currentMatchIndex >= 0) {
      this.opts.setCursor(cursorLine, cursorCol)
    }
    
    this.opts.onUpdate()
  }

  /**
   * Handle backspace in search input
   */
  handleBackspace(): void {
    const state = this.opts.getSearchState()
    if (state.promptValue.length > 0) {
      this.updatePattern(state.promptValue.slice(0, -1))
    }
  }

  /**
   * Handle character input in search mode
   */
  handleCharInput(char: string): void {
    const state = this.opts.getSearchState()
    this.updatePattern(state.promptValue + char)
  }

  /**
   * Check if search is active (typing in prompt)
   */
  isSearchActive(): boolean {
    return this.opts.getSearchState().active
  }

  /**
   * Check if there are search highlights to display
   */
  hasSearchHighlights(): boolean {
    const state = this.opts.getSearchState()
    return state.pattern.length > 0 && state.matches.length > 0
  }

  /**
   * Refresh matches after mapping changes (e.g., divider expansion)
   */
  refreshMatches(): void {
    const state = this.opts.getSearchState()
    if (!state.regex) return
    
    const matches = this.engine.findAllMatchesInMapping(state.regex)
    const cursor = this.opts.getCursor()
    
    // Find which match the cursor is on
    const currentMatchIndex = this.engine.findMatchAtPosition(
      matches,
      cursor.line,
      cursor.col
    )
    
    this.opts.setSearchState({
      ...state,
      matches,
      currentMatchIndex: currentMatchIndex >= 0 ? currentMatchIndex : state.currentMatchIndex,
    })
  }
}
