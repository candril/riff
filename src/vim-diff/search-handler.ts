/**
 * SearchHandler - Orchestrates search operations between engine, state, and UI
 * 
 * Key responsibilities:
 * - Start/stop search mode
 * - Handle incremental search updates
 * - Navigate between matches
 * - Open collapsed files that the pattern hits
 * - Auto-expand dividers when navigating to matches outside hunks
 */

import type { VimCursorState } from "./types"
import type { DiffLineMapping } from "./line-mapping"
import type { SearchState, IncrementalSearchMatch } from "./search-state"
import { createSearchState, clearSearchKeepingLast } from "./search-state"
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
  /** Every collapsed file, with the diff text its rows would show. */
  getCollapsedFiles: () => { filename: string; diff: string }[]
  /** Expand these files and rebuild the mapping. */
  expandFiles: (filenames: string[]) => void
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
    const state = this.opts.getSearchState()

    this.opts.setSearchState({
      ...createSearchState(),
      active: true,
      direction,
      originalLine: cursor.line,
      originalCol: cursor.col,
      // Abandoning this prompt must leave the previous search intact.
      lastPattern: state.lastPattern,
      lastDirection: state.lastDirection,
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
   *
   * The incremental pass only saw the rows that were on screen, and a file
   * marked viewed is collapsed out of them. Opening the collapsed files this
   * pattern hits and looking again is what makes `/foo<CR>` land on the
   * first match in the diff rather than the first one that was visible.
   */
  confirmSearch(): void {
    const state = this.opts.getSearchState()

    const anchor = this.captureAnchor(state.originalLine)
    const revealed = this.revealMatches(state.regex)
    const from = revealed ? this.relocate(anchor, state.originalLine) : state.originalLine

    const matches = state.regex ? this.engine.findAllMatchesInMapping(state.regex) : []
    const result =
      matches.length > 0
        ? this.engine.findNextMatch(matches, from, state.originalCol, state.direction)
        : null

    this.opts.setSearchState({
      ...state,
      active: false,
      promptValue: "",
      matches,
      currentMatchIndex: result?.index ?? -1,
      wrapped: result?.wrapped ?? false,
      lastPattern: state.pattern,
      lastDirection: state.direction,
    })

    if (result?.match) {
      this.opts.setCursor(result.match.line, result.match.startCol)
    }

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
    this.opts.setSearchState(clearSearchKeepingLast(state))
    
    this.opts.onUpdate()
  }

  /**
   * Clear search highlights (Escape in normal mode)
   */
  clearSearch(): void {
    this.opts.setSearchState(clearSearchKeepingLast(this.opts.getSearchState()))
    this.opts.onUpdate()
  }

  /**
   * Jump to next/previous match (n/N)
   */
  jumpToMatch(direction: "next" | "prev"): void {
    // Escape drops the pattern along with the highlights; `n` picks the last
    // one back up rather than doing nothing, as vim does.
    const state =
      !this.opts.getSearchState().pattern && this.opts.getSearchState().lastPattern
        ? this.resumeLastSearch()
        : this.opts.getSearchState()
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
    const from = this.revealAroundCursor(regex)
    const matches = regex 
      ? this.engine.findAllMatchesInMapping(regex)
      : []
    
    // Find first match in the given direction
    let currentMatchIndex = -1
    let cursorLine = from.line
    let cursorCol = from.col
    let wrapped = false
    
    if (matches.length > 0) {
      const result = this.engine.findNextMatch(
        matches,
        from.line,
        from.col,
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
      originalLine: from.line,
      originalCol: from.col,
      lastPattern: pattern,
      lastDirection: direction,
    })
    
    // Move cursor to match
    if (matches.length > 0 && currentMatchIndex >= 0) {
      this.opts.setCursor(cursorLine, cursorCol)
    }
    
    this.opts.onUpdate()
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
   * Re-arm the last pattern after Escape cleared it.
   */
  private resumeLastSearch(): SearchState {
    const state = this.opts.getSearchState()
    const regex = this.engine.compilePattern(state.lastPattern)
    this.revealAroundCursor(regex)

    const resumed: SearchState = {
      ...state,
      pattern: state.lastPattern,
      direction: state.lastDirection,
      regex,
      matches: regex ? this.engine.findAllMatchesInMapping(regex) : [],
      currentMatchIndex: -1,
      wrapped: false,
    }

    this.opts.setSearchState(resumed)
    return resumed
  }

  /**
   * Open the collapsed files this pattern hits, keeping the cursor on the
   * row it was on. Answers where that row ended up.
   */
  private revealAroundCursor(regex: RegExp | null): { line: number; col: number } {
    const cursor = this.opts.getCursor()
    const anchor = this.captureAnchor(cursor.line)
    if (!this.revealMatches(regex)) return { line: cursor.line, col: cursor.col }

    const line = this.relocate(anchor, cursor.line)
    if (line !== cursor.line) this.opts.setCursor(line, cursor.col)
    return { line, col: cursor.col }
  }

  /**
   * Open every collapsed file the pattern hits. Only files the view is
   * currently listing count: one the tree filter has hidden would stay out
   * of the mapping however far it were unfolded.
   */
  private revealMatches(regex: RegExp | null): boolean {
    if (!regex) return false

    const listed = new Set<string>()
    const mapping = this.opts.getMapping()
    for (let i = 0; i < mapping.lineCount; i++) {
      const line = mapping.getLine(i)
      if (line?.type === "file-header" && line.filename) listed.add(line.filename)
    }
    if (listed.size === 0) return false

    const toOpen = this.opts
      .getCollapsedFiles()
      .filter((file) => listed.has(file.filename))
      .filter((file) => this.engine.diffContainsMatch(file.diff, regex))
      .map((file) => file.filename)

    if (toOpen.length === 0) return false
    this.opts.expandFiles(toOpen)
    return true
  }

  /**
   * What a row points at, so it can be found again once opening a file above
   * it has shifted every index below.
   */
  private captureAnchor(line: number): { filename: string; lineNum?: number } | null {
    const row = this.opts.getMapping().getLine(line)
    if (!row?.filename) return null
    return { filename: row.filename, lineNum: row.newLineNum }
  }

  private relocate(anchor: { filename: string; lineNum?: number } | null, fallback: number): number {
    if (!anchor) return fallback
    const mapping = this.opts.getMapping()

    if (anchor.lineNum !== undefined) {
      const found = mapping.findVisualLineForFileLine(anchor.filename, anchor.lineNum)
      if (found !== null) return found
    }

    // A deleted row has no line number on the new side; its file's first row
    // is close enough to carry on searching from.
    for (let i = 0; i < mapping.lineCount; i++) {
      if (mapping.getLine(i)?.filename === anchor.filename) return i
    }
    return fallback
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
