# In-View Search

**Status**: Draft

## Description

Vim-style incremental search within Diff View and Comments View. Press `/` to search forward, `?` to search backward. Press `*` to search for the word under cursor. All matches are highlighted in real-time as you type (incremental search), with `n/N` to navigate between matches.

Search operates on the **full file content**, not just the diff hunks. The file content loading infrastructure already exists (`fileContentCache` in state) - search triggers loading if needed and auto-expands collapsed dividers when navigating to matches outside hunks.

## Out of Scope

- Full-text search across all files (use Omni Search with `/` prefix)
- Regex flags UI (case sensitivity toggle, whole word, etc.)
- Search and replace
- Search history persistence across sessions
- Regex support (literal string matching only)
- Smart case sensitivity
- Search within visual selection

## Capabilities

### P1 - MVP

**Full File Search:**
- **Load on search**: When `/` or `*` is pressed, ensure file content is loaded via existing `fileContentCache`
- **Search full content**: Search the complete file, not just visible hunks
- **Auto-expand**: When navigating to a match in a collapsed section, auto-expand that divider
- **Loading indicator**: Show "Loading..." in search prompt while fetching

**Search Activation:**
- **Forward search**: `/` opens search prompt, searches forward from cursor
- **Backward search**: `?` opens search prompt, searches backward from cursor
- **Word under cursor**: `*` searches forward for word under cursor, `#` searches backward

**Incremental Search:**
- **Live matching**: Matches highlighted as you type (before pressing Enter)
- **Jump to first match**: Cursor moves to first match while typing
- **Match count**: Show "Match X of Y" in search prompt
- **No match indicator**: Visual feedback when pattern has no matches

**Match Navigation:**
- **Next match**: `n` jumps to next match (wraps around)
- **Previous match**: `N` jumps to previous match (wraps around)
- **Wrap notification**: Brief indicator when search wraps to top/bottom
- **Context expansion**: When navigating to match outside diff hunk, expand context around it

**Match Highlighting:**
- **All matches**: Highlight all occurrences in visible area
- **Current match**: Distinct highlight for the match cursor is on
- **Persist after search**: Highlights remain until next search or `Esc`

**Search Prompt UI:**
- **Prompt display**: Show `/pattern` or `?pattern` at bottom of view
- **Editing**: Standard editing (backspace, delete, arrows)
- **Cancel**: `Esc` cancels search, returns cursor to original position
- **Confirm**: `Enter` confirms search, cursor stays at match

## Technical Notes

### Search State

```typescript
// src/vim-diff/search-state.ts

export interface SearchState {
  // Search mode
  active: boolean
  direction: "forward" | "backward"
  
  // Current search
  pattern: string
  regex: RegExp | null       // Compiled pattern (null if invalid)
  
  // Matches
  matches: SearchMatch[]     // All matches in current view
  currentMatchIndex: number  // Which match cursor is on (-1 if none)
  
  // Original position (for cancel)
  originalLine: number
  originalCol: number
  
  // UI state
  promptValue: string        // What user is typing (may differ from confirmed pattern)
  error: string | null       // "Invalid regex" etc.
}

export interface SearchMatch {
  line: number               // Visual line index (0-indexed)
  startCol: number           // Start column in line
  endCol: number             // End column (exclusive)
  fileIndex?: number         // For all-files view
}

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
  }
}
```

### Search Engine

The search engine searches against the **full file content** (from `fileContentCache`), not just the visible diff lines. This allows finding matches anywhere in the file.

```typescript
// src/vim-diff/search-engine.ts

export class SearchEngine {
  constructor(
    private mapping: DiffLineMapping,
    private getFileContent: (filename: string) => string | null
  ) {}
  
  /**
   * Compile search pattern to regex (case-insensitive literal match)
   */
  compilePattern(pattern: string): RegExp | null {
    if (!pattern) return null
    
    try {
      // Escape special regex chars for literal search
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      return new RegExp(escaped, "gi")
    } catch {
      return null
    }
  }
  
  /**
   * Find all matches in the full file content
   * Returns matches with file line numbers (1-indexed) that need to be
   * mapped to visual lines (may require expanding dividers)
   */
  findAllMatchesInFile(filename: string, regex: RegExp): FileSearchMatch[] {
    const content = this.getFileContent(filename)
    if (!content) return []
    
    const lines = content.split("\n")
    const matches: FileSearchMatch[] = []
    
    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const lineContent = lines[lineNum - 1]!
      regex.lastIndex = 0
      
      let match: RegExpExecArray | null
      while ((match = regex.exec(lineContent)) !== null) {
        matches.push({
          filename,
          lineNum,        // 1-indexed file line number
          startCol: match.index,
          endCol: match.index + match[0].length,
        })
        
        if (match[0].length === 0) regex.lastIndex++
      }
    }
    
    return matches
  }
  
  /**
   * Get word under cursor for * and # commands
   */
  getWordUnderCursor(line: number, col: number): string | null {
    const content = this.mapping.getLineContent(line)
    if (!content || col >= content.length) return null
    
    const wordChars = /[\w]/
    if (!wordChars.test(content[col] ?? "")) return null
    
    let start = col
    while (start > 0 && wordChars.test(content[start - 1] ?? "")) start--
    
    let end = col
    while (end < content.length && wordChars.test(content[end] ?? "")) end++
    
    return content.slice(start, end)
  }
}

interface FileSearchMatch {
  filename: string
  lineNum: number      // 1-indexed line in full file
  startCol: number
  endCol: number
}
```

### Search Handler

The search handler coordinates between the search engine and the app state. Key responsibility: when navigating to a match that's in a collapsed divider region, it auto-expands that divider.

```typescript
// src/vim-diff/search-handler.ts

export class SearchHandler {
  constructor(private opts: {
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
  }) {}
  
  /**
   * Start search mode - ensure file content is loaded first
   */
  async startSearch(direction: "forward" | "backward"): Promise<void> {
    const cursor = this.opts.getCursor()
    const mapping = this.opts.getMapping()
    
    // Get current filename
    const currentLine = mapping.getLine(cursor.line)
    const filename = currentLine?.filename
    
    // Load file content if needed
    if (filename && !this.opts.getFileContent(filename)) {
      this.opts.setSearchState({
        ...createSearchState(),
        active: true,
        direction,
        loading: true,
      })
      this.opts.onUpdate()
      
      await this.opts.loadFileContent(filename)
    }
    
    this.opts.setSearchState({
      ...createSearchState(),
      active: true,
      direction,
      originalLine: cursor.line,
      originalCol: cursor.col,
      loading: false,
    })
    
    this.opts.onUpdate()
  }
  
  /**
   * Navigate to a match - auto-expand divider if needed
   */
  navigateToMatch(match: FileSearchMatch): void {
    // Check if this line is visible or in a collapsed divider
    const mapping = this.opts.getMapping()
    const visualLine = mapping.findVisualLineForFileLine(match.filename, match.lineNum)
    
    if (visualLine === null) {
      // Line is in a collapsed divider - expand it
      this.opts.expandDividerForLine(match.filename, match.lineNum)
      // After expansion, re-find the visual line
      // (mapping will be recreated by onUpdate)
    }
    
    this.opts.onUpdate()
    
    // Now find and navigate to the visual line
    const newMapping = this.opts.getMapping()
    const newVisualLine = newMapping.findVisualLineForFileLine(match.filename, match.lineNum)
    if (newVisualLine !== null) {
      this.opts.setCursor(newVisualLine, match.startCol)
    }
  }
  
  // ... rest of handler methods (startSearch, updatePattern, confirm, cancel, jumpToMatch)
}
```

### Integration with VimDiffView

```typescript
// In VimDiffView component - add match highlighting

function buildSearchHighlights(
  searchState: SearchState,
  theme: Theme
): Map<number, InlineHighlight[]> {
  const highlights = new Map<number, InlineHighlight[]>()
  
  if (!searchState.pattern || searchState.matches.length === 0) {
    return highlights
  }
  
  for (let i = 0; i < searchState.matches.length; i++) {
    const match = searchState.matches[i]!
    const isCurrentMatch = i === searchState.currentMatchIndex
    
    const lineHighlights = highlights.get(match.line) || []
    lineHighlights.push({
      startCol: match.startCol,
      endCol: match.endCol,
      bg: isCurrentMatch ? theme.peach : theme.yellow,
      fg: theme.base,
    })
    highlights.set(match.line, lineHighlights)
  }
  
  return highlights
}
```

### Search Prompt Component

```typescript
// src/components/SearchPrompt.ts

export interface SearchPromptProps {
  searchState: SearchState
  theme: Theme
}

export function SearchPrompt({ searchState, theme }: SearchPromptProps): Element {
  if (!searchState.active && !searchState.pattern) {
    return Box({ height: 0 })
  }
  
  const prefix = searchState.direction === "forward" ? "/" : "?"
  const matchInfo = searchState.matches.length > 0
    ? `[${searchState.currentMatchIndex + 1}/${searchState.matches.length}]`
    : searchState.promptValue
      ? "[No matches]"
      : ""
  
  return Box(
    { height: 1, width: "100%", backgroundColor: theme.surface0 },
    
    // Search prompt
    Text({
      content: searchState.active
        ? `${prefix}${searchState.promptValue}`
        : `${prefix}${searchState.pattern}`,
      fg: searchState.error ? theme.red : theme.text,
    }),
    
    // Match count
    Text({
      content: ` ${matchInfo}`,
      fg: searchState.matches.length === 0 ? theme.red : theme.subtext0,
    }),
    
    // Error message
    searchState.error && Text({
      content: ` ${searchState.error}`,
      fg: theme.red,
    }),
  )
}
```

### Key Handling

```typescript
// In app.ts key handler

// Normal mode - start search
if (key.name === "/" && !key.ctrl && !key.alt) {
  searchHandler.startSearch("forward")
  return true
}
if (key.name === "?" || (key.name === "/" && key.shift)) {
  searchHandler.startSearch("backward")
  return true
}

// Word under cursor search
if (key.name === "8" && key.shift) { // *
  searchHandler.searchWordUnderCursor("forward")
  return true
}
if (key.name === "3" && key.shift) { // #
  searchHandler.searchWordUnderCursor("backward")
  return true
}

// Navigate matches
if (key.name === "n" && !key.ctrl && !key.alt) {
  searchHandler.jumpToMatch("next")
  return true
}
if (key.name === "n" && key.shift) { // N
  searchHandler.jumpToMatch("prev")
  return true
}

// In search prompt mode
if (searchState.active) {
  if (key.name === "escape") {
    searchHandler.cancelSearch()
    return true
  }
  if (key.name === "return" || key.name === "enter") {
    searchHandler.confirmSearch()
    return true
  }
  if (key.name === "backspace") {
    searchHandler.updateSearchPattern(
      searchState.promptValue.slice(0, -1)
    )
    return true
  }
  // Regular character input
  if (key.sequence && key.sequence.length === 1) {
    searchHandler.updateSearchPattern(
      searchState.promptValue + key.sequence
    )
    return true
  }
}

// Clear highlights with Escape in normal mode
if (key.name === "escape" && searchState.pattern) {
  searchHandler.clearSearch()
  return true
}
```

### Comments View Search

Search in Comments View uses the same patterns but searches through comment text:

```typescript
// src/components/CommentsView.ts - search integration

function getSearchableContent(threads: Thread[]): SearchableItem[] {
  const items: SearchableItem[] = []
  
  for (const thread of threads) {
    for (const comment of thread.comments) {
      items.push({
        type: "comment",
        content: comment.body,
        thread,
        comment,
      })
    }
  }
  
  return items
}

// Search matches highlight comment text, n/N jumps between comments
```

### DiffLineMapping Extensions

Add method to map file line numbers to visual lines (for navigating to search matches):

```typescript
// In src/vim-diff/line-mapping.ts

/**
 * Find the visual line index for a given file line number.
 * Returns null if the line is in a collapsed divider region.
 */
findVisualLineForFileLine(filename: string, lineNum: number): number | null {
  for (let i = 0; i < this.lines.length; i++) {
    const line = this.lines[i]!
    if (line.filename === filename && line.newLineNum === lineNum) {
      return i
    }
  }
  return null  // Line is collapsed
}

/**
 * Find which divider contains a given file line (for auto-expansion)
 */
findDividerForLine(filename: string, lineNum: number): string | null {
  for (let i = 0; i < this.lines.length; i++) {
    const line = this.lines[i]!
    if (line.type === "divider" && line.filename === filename && line.dividerKey) {
      // Check if lineNum falls within this divider's range
      // (need to track divider ranges during parsing)
      // Return dividerKey if lineNum is in range
    }
  }
  return null
}
```

### File Structure

```
src/
  vim-diff/
    search-state.ts       # SearchState interface
    search-engine.ts      # SearchEngine class (pattern matching)  
    search-handler.ts     # SearchHandler class (orchestration)
    line-mapping.ts       # Add findVisualLineForFileLine, findDividerForLine
  components/
    SearchPrompt.ts       # Search input UI
    VimDiffView.ts        # Add highlight integration
    CommentsView.ts       # Add search support
```

### Status Bar Integration

Update status bar hints when search is active:

```
Normal mode:  "j/k: move  /: search  n/N: next/prev match"
Search mode:  "Enter: confirm  Esc: cancel  Type to search..."
After search: "n: next  N: prev  Esc: clear"
```

### Accessibility

- Search prompt is focusable and announces match count to screen readers
- Match highlights use distinct colors that work in high contrast mode
- "Wrapped to top/bottom" announced when search wraps
