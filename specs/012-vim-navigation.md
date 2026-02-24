# Vim Navigation and Line Selection

**Status**: Draft

## Description

Replace the current DiffRenderable-based diff view with a custom renderer built on OpenTUI's CodeRenderable and LineNumberRenderable. This enables full vim-style navigation, visual line selection for comments, and precise line mapping that works in both single-file and all-files views.

## Out of Scope

- Character-level text selection (line-based only)
- Split/side-by-side view (keep unified for now, design for future support)
- Inline comment expansion in diff view
- Real-time collaborative editing

## Capabilities

### P1 - MVP

**Navigation:**
- **Basic motions**: `j/k` line movement, `h/l` character movement (track column)
- **Page navigation**: `Ctrl-d/u` half-page, `Ctrl-f/b` full page, `gg/G` top/bottom
- **Word motions**: `w/e/b` word forward/end/back, `W/E/B` WORD motions
- **Line motions**: `0` start of line, `^` first non-space, `$` end of line
- **Find in line**: `f{char}` find forward, `F{char}` find back, `t/T` till variants, `;/,` repeat

**Selection:**
- **Visual line mode**: `V` to start, `j/k` to extend, `Esc` to cancel
- **Comment on selection**: `c` to add comment on selected line(s)
- **Selection highlight**: Visual feedback for selected range

**Integration:**
- **Cursor highlight**: Current line highlighted in gutter and content
- **Comment indicators**: Markers in gutter for lines with comments
- **Syntax highlighting**: Tree-sitter integration via CodeRenderable
- **All-files view**: Full navigation and comments in combined view

### P2 - Enhanced Navigation

- **Search**: `/pattern` to search, `n/N` for next/prev match
- **Hunk navigation**: `]c/[c` to jump between diff hunks (changes)
- **Marks**: `m{a-z}` to set mark, `'{a-z}` to jump to mark
- **Jump list**: `Ctrl-o/Ctrl-i` to navigate jump history

### P3 - Polish

- **Count prefix**: `5j` move 5 lines, `3w` move 3 words
- **Relative line numbers**: Option to show relative line numbers
- **Cursor column memory**: Remember column when moving vertically
- **Smooth scrolling**: Animated scroll for large jumps

## Technical Notes

### Architecture Overview

```
+----------------------------------------------------------------------+
|                           VimDiffView                                 |
|  +----------------------------------------------------------------+  |
|  |                         ScrollBox                               |  |
|  |  +----------------------------------------------------------+  |  |
|  |  |                 LineNumberRenderable                      |  |  |
|  |  |   - setLineColor() - cursor line highlight                |  |  |
|  |  |   - highlightLines() - visual selection range             |  |  |
|  |  |   - setLineSign() - comment indicators                    |  |  |
|  |  |  +----------------------------------------------------+  |  |  |
|  |  |  |              CodeRenderable                         |  |  |  |
|  |  |  |   - content: formatted diff text                    |  |  |  |
|  |  |  |   - filetype: for syntax highlighting               |  |  |  |
|  |  |  |   - treeSitterClient: shared highlighting engine    |  |  |  |
|  |  |  +----------------------------------------------------+  |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |                      DiffLineMapping                            |  |
|  |   - visualLine <-> DiffLine (type, content, oldNum, newNum)    |  |
|  |   - DiffLine <-> file/lineNum (for comments)                   |  |
|  +----------------------------------------------------------------+  |
|                                                                      |
|  +----------------------------------------------------------------+  |
|  |                       VimCursorState                            |  |
|  |   - cursorLine, cursorCol                                      |  |
|  |   - mode: "normal" | "visual-line"                             |  |
|  |   - selectionAnchor (for V selection)                          |  |
|  |   - jumpList, marks                                            |  |
|  +----------------------------------------------------------------+  |
+----------------------------------------------------------------------+
```

### DiffLine Model

```typescript
// src/vim-diff/types.ts

/**
 * Represents a single line in the parsed diff
 */
export interface DiffLine {
  visualIndex: number          // 0-indexed position in rendered output
  type: DiffLineType
  content: string              // The actual text content (without +/- prefix)
  rawLine: string              // Original line from diff (with +/- prefix)
  
  // Line numbers (undefined for headers/hunks)
  oldLineNum?: number          // Line number in old file
  newLineNum?: number          // Line number in new file
  
  // For all-files view
  fileIndex?: number           // Which file this belongs to
  filename?: string            // Filename for headers
  
  // For hunk lines
  hunkInfo?: {
    oldStart: number
    oldCount: number
    newStart: number
    newCount: number
  }
}

export type DiffLineType = 
  | "file-header"     // diff --git, index, etc.
  | "hunk-header"     // @@ -1,3 +1,4 @@
  | "context"         // Unchanged line (space prefix)
  | "addition"        // Added line (+ prefix)
  | "deletion"        // Removed line (- prefix)
  | "no-newline"      // \ No newline at end of file
  | "spacing"         // Empty line between files (all-files view)
```

### DiffLineMapping

```typescript
// src/vim-diff/line-mapping.ts

export class DiffLineMapping {
  private lines: DiffLine[] = []
  private linesByFile: Map<number, DiffLine[]> = new Map()
  
  constructor(files: DiffFile[], mode: "single" | "all", fileIndex?: number) {
    this.lines = mode === "single" 
      ? this.parseSingleFile(files[fileIndex!]!, fileIndex!)
      : this.parseAllFiles(files)
  }
  
  /**
   * Get total number of visual lines
   */
  get lineCount(): number {
    return this.lines.length
  }
  
  /**
   * Get DiffLine at visual index (0-indexed)
   */
  getLine(visualIndex: number): DiffLine | undefined {
    return this.lines[visualIndex]
  }
  
  /**
   * Get line content for vim motions
   */
  getLineContent(visualIndex: number): string {
    return this.lines[visualIndex]?.content ?? ""
  }
  
  /**
   * Check if line is commentable (not header/spacing)
   */
  isCommentable(visualIndex: number): boolean {
    const line = this.lines[visualIndex]
    if (!line) return false
    return ["context", "addition", "deletion"].includes(line.type)
  }
  
  /**
   * Get comment anchor info for a line
   */
  getCommentAnchor(visualIndex: number): CommentAnchor | null {
    const line = this.lines[visualIndex]
    if (!line || !this.isCommentable(visualIndex)) return null
    
    return {
      filename: line.filename!,
      line: line.newLineNum ?? line.oldLineNum!,
      side: line.type === "deletion" ? "LEFT" : "RIGHT",
    }
  }
  
  /**
   * Find visual line for a comment (reverse lookup)
   */
  findLineForComment(comment: Comment): number | null {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i]!
      if (line.filename === comment.filename) {
        const lineNum = comment.side === "LEFT" ? line.oldLineNum : line.newLineNum
        if (lineNum === comment.line) {
          return i
        }
      }
    }
    return null
  }
  
  /**
   * Find word boundaries for vim motions
   */
  findWordBoundary(
    visualIndex: number, 
    col: number, 
    direction: "forward" | "backward",
    wordType: "word" | "WORD"
  ): { line: number; col: number } {
    // Implementation for w/e/b/W/E/B motions
    // ...
  }
  
  /**
   * Find next/previous hunk
   */
  findHunk(fromLine: number, direction: "next" | "prev"): number | null {
    const delta = direction === "next" ? 1 : -1
    for (let i = fromLine + delta; i >= 0 && i < this.lines.length; i += delta) {
      if (this.lines[i]?.type === "hunk-header") {
        return i
      }
    }
    return null
  }
  
  /**
   * Search for pattern
   */
  search(pattern: RegExp, fromLine: number, direction: "forward" | "backward"): SearchMatch | null {
    // Implementation for /search
    // ...
  }
  
  // Private parsing methods
  private parseSingleFile(file: DiffFile, fileIndex: number): DiffLine[] {
    return this.parseFileContent(file.content, fileIndex, file.filename)
  }
  
  private parseAllFiles(files: DiffFile[]): DiffLine[] {
    const allLines: DiffLine[] = []
    
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]!
      
      // File header
      allLines.push({
        visualIndex: allLines.length,
        type: "file-header",
        content: file.filename,
        rawLine: `--- ${file.filename}`,
        fileIndex,
        filename: file.filename,
      })
      
      // File diff content
      const fileLines = this.parseFileContent(file.content, fileIndex, file.filename)
      for (const line of fileLines) {
        line.visualIndex = allLines.length
        allLines.push(line)
      }
      
      // Spacing after file (except last)
      if (fileIndex < files.length - 1) {
        allLines.push({
          visualIndex: allLines.length,
          type: "spacing",
          content: "",
          rawLine: "",
          fileIndex,
          filename: file.filename,
        })
      }
    }
    
    return allLines
  }
  
  private parseFileContent(content: string, fileIndex: number, filename: string): DiffLine[] {
    const lines: DiffLine[] = []
    const rawLines = content.split("\n")
    
    let oldLineNum = 0
    let newLineNum = 0
    let inHunk = false
    
    for (const rawLine of rawLines) {
      // Skip diff --git header (we add our own file header)
      if (rawLine.startsWith("diff --git")) continue
      if (rawLine.startsWith("index ")) continue
      if (rawLine.startsWith("--- ")) continue
      if (rawLine.startsWith("+++ ")) continue
      
      // Hunk header
      const hunkMatch = rawLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (hunkMatch) {
        oldLineNum = parseInt(hunkMatch[1]!, 10)
        newLineNum = parseInt(hunkMatch[3]!, 10)
        inHunk = true
        
        lines.push({
          visualIndex: lines.length,
          type: "hunk-header",
          content: rawLine,
          rawLine,
          fileIndex,
          filename,
          hunkInfo: {
            oldStart: oldLineNum,
            oldCount: parseInt(hunkMatch[2] ?? "1", 10),
            newStart: newLineNum,
            newCount: parseInt(hunkMatch[4] ?? "1", 10),
          },
        })
        continue
      }
      
      if (!inHunk) continue
      
      // Content lines
      if (rawLine.startsWith("+")) {
        lines.push({
          visualIndex: lines.length,
          type: "addition",
          content: rawLine.slice(1),
          rawLine,
          newLineNum,
          fileIndex,
          filename,
        })
        newLineNum++
      } else if (rawLine.startsWith("-")) {
        lines.push({
          visualIndex: lines.length,
          type: "deletion",
          content: rawLine.slice(1),
          rawLine,
          oldLineNum,
          fileIndex,
          filename,
        })
        oldLineNum++
      } else if (rawLine.startsWith(" ")) {
        lines.push({
          visualIndex: lines.length,
          type: "context",
          content: rawLine.slice(1),
          rawLine,
          oldLineNum,
          newLineNum,
          fileIndex,
          filename,
        })
        oldLineNum++
        newLineNum++
      } else if (rawLine.startsWith("\\")) {
        lines.push({
          visualIndex: lines.length,
          type: "no-newline",
          content: rawLine,
          rawLine,
          fileIndex,
          filename,
        })
      }
    }
    
    return lines
  }
}

interface CommentAnchor {
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
}

interface SearchMatch {
  line: number
  col: number
  length: number
}
```

### VimCursorState

```typescript
// src/vim-diff/cursor-state.ts

export type VimMode = "normal" | "visual-line"

export interface VimCursorState {
  // Current position
  line: number              // 0-indexed visual line
  col: number               // 0-indexed column (for horizontal motions)
  
  // Mode
  mode: VimMode
  
  // Visual selection (when mode === "visual-line")
  selectionAnchor: number | null  // Line where V was pressed
  
  // Jump list for Ctrl-o/Ctrl-i
  jumpList: number[]
  jumpIndex: number
  
  // Marks
  marks: Map<string, number>  // 'a' -> line number
  
  // Search state
  lastSearch: string | null
  searchDirection: "forward" | "backward"
  
  // For column memory (g_ behavior)
  desiredCol: number | null
}

export function createCursorState(): VimCursorState {
  return {
    line: 0,
    col: 0,
    mode: "normal",
    selectionAnchor: null,
    jumpList: [],
    jumpIndex: -1,
    marks: new Map(),
    lastSearch: null,
    searchDirection: "forward",
    desiredCol: null,
  }
}

/**
 * Get selection range (sorted)
 */
export function getSelectionRange(state: VimCursorState): [number, number] | null {
  if (state.mode !== "visual-line" || state.selectionAnchor === null) {
    return null
  }
  
  const start = Math.min(state.selectionAnchor, state.line)
  const end = Math.max(state.selectionAnchor, state.line)
  return [start, end]
}
```

### VimMotionHandler

```typescript
// src/vim-diff/motion-handler.ts

export class VimMotionHandler {
  constructor(
    private mapping: DiffLineMapping,
    private getState: () => VimCursorState,
    private setState: (state: VimCursorState) => void,
    private onCursorMove: () => void,
  ) {}
  
  /**
   * Handle a keypress, return true if handled
   */
  handleKey(key: KeyEvent): boolean {
    const state = this.getState()
    
    // Escape - exit visual mode
    if (key.name === "escape") {
      if (state.mode === "visual-line") {
        this.setState({ ...state, mode: "normal", selectionAnchor: null })
        this.onCursorMove()
        return true
      }
      return false
    }
    
    // V - enter visual line mode
    if (key.name === "v" && key.shift) {
      this.setState({
        ...state,
        mode: "visual-line",
        selectionAnchor: state.line,
      })
      this.onCursorMove()
      return true
    }
    
    // Basic vertical motions
    if (key.name === "j" || key.name === "down") {
      this.moveLine(1)
      return true
    }
    if (key.name === "k" || key.name === "up") {
      this.moveLine(-1)
      return true
    }
    
    // Page motions
    if (key.name === "d" && key.ctrl) {
      this.moveLine(Math.floor(this.getViewportHeight() / 2))
      return true
    }
    if (key.name === "u" && key.ctrl) {
      this.moveLine(-Math.floor(this.getViewportHeight() / 2))
      return true
    }
    
    // Top/bottom
    if (key.name === "g" && !key.ctrl && !key.alt) {
      // Wait for second g (handled by key sequence system)
      return false
    }
    
    // Word motions
    if (key.name === "w") {
      this.moveWord("forward", key.shift ? "WORD" : "word")
      return true
    }
    if (key.name === "b") {
      this.moveWord("backward", key.shift ? "WORD" : "word")
      return true
    }
    if (key.name === "e") {
      this.moveWordEnd("forward", key.shift ? "WORD" : "word")
      return true
    }
    
    // Line motions
    if (key.name === "0") {
      this.moveToCol(0)
      return true
    }
    if (key.name === "^" || (key.name === "6" && key.shift)) {
      this.moveToFirstNonSpace()
      return true
    }
    if (key.name === "$" || (key.name === "4" && key.shift)) {
      this.moveToEndOfLine()
      return true
    }
    
    // Hunk navigation
    if (key.name === "c" && key.sequence === "]c") {
      this.moveToHunk("next")
      return true
    }
    if (key.name === "c" && key.sequence === "[c") {
      this.moveToHunk("prev")
      return true
    }
    
    return false
  }
  
  // Movement implementations
  private moveLine(delta: number): void {
    const state = this.getState()
    const newLine = Math.max(0, Math.min(this.mapping.lineCount - 1, state.line + delta))
    
    // Preserve column or use desired column
    const lineContent = this.mapping.getLineContent(newLine)
    const col = state.desiredCol !== null 
      ? Math.min(state.desiredCol, lineContent.length - 1)
      : Math.min(state.col, lineContent.length - 1)
    
    this.setState({
      ...state,
      line: newLine,
      col: Math.max(0, col),
      desiredCol: state.desiredCol ?? state.col,
    })
    this.onCursorMove()
  }
  
  private moveWord(direction: "forward" | "backward", type: "word" | "WORD"): void {
    const state = this.getState()
    const result = this.mapping.findWordBoundary(state.line, state.col, direction, type)
    
    this.setState({
      ...state,
      line: result.line,
      col: result.col,
      desiredCol: null,
    })
    this.onCursorMove()
  }
  
  private moveToHunk(direction: "next" | "prev"): void {
    const state = this.getState()
    const hunkLine = this.mapping.findHunk(state.line, direction)
    
    if (hunkLine !== null) {
      this.addToJumpList(state.line)
      this.setState({
        ...state,
        line: hunkLine,
        col: 0,
        desiredCol: null,
      })
      this.onCursorMove()
    }
  }
  
  private addToJumpList(line: number): void {
    const state = this.getState()
    const jumpList = [...state.jumpList.slice(0, state.jumpIndex + 1), line]
    this.setState({
      ...state,
      jumpList,
      jumpIndex: jumpList.length - 1,
    })
  }
  
  // ... more movement implementations
}
```

### VimDiffView Component

```typescript
// src/components/VimDiffView.ts
import { Box, ScrollBox, CodeRenderable, LineNumberRenderable } from "@opentui/core"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { VimCursorState, getSelectionRange } from "../vim-diff/cursor-state"

export interface VimDiffViewProps {
  files: DiffFile[]
  selectedFileIndex: number | null  // null = all files
  cursorState: VimCursorState
  comments: Comment[]
  treeSitterClient: TreeSitterClient
  syntaxStyle: SyntaxStyle
  theme: Theme
}

export function VimDiffView(props: VimDiffViewProps): Element {
  const { files, selectedFileIndex, cursorState, comments, theme } = props
  
  // Build line mapping
  const mode = selectedFileIndex === null ? "all" : "single"
  const mapping = new DiffLineMapping(files, mode, selectedFileIndex ?? undefined)
  
  // Build formatted content for CodeRenderable
  const content = buildDiffContent(mapping)
  
  // Determine filetype for syntax highlighting
  const filetype = selectedFileIndex !== null 
    ? getFiletype(files[selectedFileIndex]!.filename)
    : undefined  // Mixed files - no highlighting
  
  return Box(
    { width: "100%", height: "100%", flexDirection: "row" },
    
    ScrollBox(
      { 
        id: "diff-scroll", 
        flexGrow: 1, 
        scrollY: true,
        scrollX: true,
      },
      
      h(LineNumberRenderable, {
        id: "diff-line-numbers",
        fg: theme.overlay0,
        bg: theme.mantle,
        showLineNumbers: true,
        
        // Cursor line highlighting
        lineColors: buildLineColors(cursorState, mapping, comments, theme),
        
        // Comment indicators
        lineSigns: buildLineSigns(mapping, comments, theme),
      },
        h(CodeRenderable, {
          id: "diff-code",
          content,
          filetype,
          syntaxStyle: props.syntaxStyle,
          treeSitterClient: props.treeSitterClient,
          
          // Diff-specific styling
          // (CodeRenderable will handle base styling,
          //  we add line-level colors via LineNumberRenderable)
        })
      )
    )
  )
}

function buildDiffContent(mapping: DiffLineMapping): string {
  const lines: string[] = []
  
  for (let i = 0; i < mapping.lineCount; i++) {
    const line = mapping.getLine(i)!
    
    switch (line.type) {
      case "file-header":
        lines.push(`--- ${line.content}`)
        break
      case "hunk-header":
        lines.push(line.content)
        break
      case "addition":
        lines.push(`+${line.content}`)
        break
      case "deletion":
        lines.push(`-${line.content}`)
        break
      case "context":
        lines.push(` ${line.content}`)
        break
      case "no-newline":
        lines.push(line.content)
        break
      case "spacing":
        lines.push("")
        break
    }
  }
  
  return lines.join("\n")
}

function buildLineColors(
  cursorState: VimCursorState,
  mapping: DiffLineMapping,
  comments: Comment[],
  theme: Theme
): Map<number, LineColorConfig> {
  const colors = new Map<number, LineColorConfig>()
  
  // Visual selection range
  const selectionRange = getSelectionRange(cursorState)
  if (selectionRange) {
    const [start, end] = selectionRange
    for (let i = start; i <= end; i++) {
      colors.set(i, {
        gutter: theme.surface1,
        content: theme.surface0,
      })
    }
  }
  
  // Current cursor line (overrides selection for that line)
  colors.set(cursorState.line, {
    gutter: theme.pink,
    content: theme.surface1,
  })
  
  // Lines with comments get subtle highlight
  const commentLines = new Set<number>()
  for (const comment of comments) {
    const visualLine = mapping.findLineForComment(comment)
    if (visualLine !== null) {
      commentLines.add(visualLine)
    }
  }
  
  // Don't override cursor/selection colors for comment lines
  // Just track them for the sign column
  
  return colors
}

function buildLineSigns(
  mapping: DiffLineMapping,
  comments: Comment[],
  theme: Theme
): Map<number, LineSign> {
  const signs = new Map<number, LineSign>()
  
  // Find lines with comments
  for (const comment of comments) {
    const visualLine = mapping.findLineForComment(comment)
    if (visualLine !== null) {
      // Determine color based on status
      const color = comment.status === "synced" ? theme.green
        : comment.status === "pending" ? theme.yellow
        : theme.blue
      
      signs.set(visualLine, {
        after: " ",
        afterColor: color,
      })
    }
  }
  
  return signs
}
```

### Integration with app.ts

```typescript
// In app.ts

// Replace existing cursor state with vim state
let vimState = createCursorState()
let lineMapping: DiffLineMapping

function updateLineMapping() {
  const mode = state.selectedFileIndex === null ? "all" : "single"
  lineMapping = new DiffLineMapping(
    state.files, 
    mode, 
    state.selectedFileIndex ?? undefined
  )
}

const vimHandler = new VimMotionHandler(
  () => lineMapping,
  () => vimState,
  (newState) => { vimState = newState; render() },
  () => {
    // Ensure cursor visible in viewport
    ensureCursorVisible()
    // Update line highlights
    render()
  }
)

// Key handling
renderer.keyInput.on("keypress", (key) => {
  // Let vim handler try first
  if (vimHandler.handleKey(key)) {
    return
  }
  
  // Handle comment on selection
  if (key.name === "c") {
    handleComment()
    return
  }
  
  // ... other key handling
})

async function handleComment() {
  if (vimState.mode === "visual-line") {
    // Comment on selected range
    const range = getSelectionRange(vimState)
    if (range) {
      const [startLine, endLine] = range
      await openCommentEditorForRange(startLine, endLine)
      
      // Exit visual mode
      vimState = { ...vimState, mode: "normal", selectionAnchor: null }
      render()
    }
  } else {
    // Comment on current line
    if (lineMapping.isCommentable(vimState.line)) {
      await openCommentEditorForLine(vimState.line)
    }
  }
}

async function openCommentEditorForRange(startLine: number, endLine: number) {
  // Get comment anchor from first commentable line in range
  let anchor: CommentAnchor | null = null
  for (let i = startLine; i <= endLine; i++) {
    anchor = lineMapping.getCommentAnchor(i)
    if (anchor) break
  }
  
  if (!anchor) return
  
  // Build diff context from range
  const contextLines: string[] = []
  for (let i = startLine; i <= endLine; i++) {
    const line = lineMapping.getLine(i)
    if (line) {
      contextLines.push(line.rawLine)
    }
  }
  
  // Open editor with context
  const body = await openCommentEditor({
    diffContent: contextLines.join("\n"),
    filePath: anchor.filename,
    line: anchor.line,
  })
  
  if (body) {
    const comment = createComment(anchor.filename, anchor.line, body, anchor.side)
    await saveComment(comment)
    state = addComment(state, comment)
    render()
  }
}
```

### File Structure

```
src/
  vim-diff/
    types.ts              # DiffLine, DiffLineType
    line-mapping.ts       # DiffLineMapping class
    cursor-state.ts       # VimCursorState, selection helpers
    motion-handler.ts     # VimMotionHandler class
    word-motion.ts        # Word/WORD boundary finding
    search.ts             # Search implementation
  components/
    VimDiffView.ts        # New diff view component
    DiffView.ts           # (deprecated, keep for reference)
  app.ts                  # Integration
```

### Migration Path

1. **Phase 1**: Build vim-diff/ module with types and mapping
2. **Phase 2**: Implement VimMotionHandler with basic motions (j/k, gg/G, Ctrl-d/u)
3. **Phase 3**: Build VimDiffView component, integrate with app.ts
4. **Phase 4**: Add visual line mode and comment integration
5. **Phase 5**: Add word motions, search, marks
6. **Phase 6**: Deprecate old DiffView

### Key Implementation Notes

1. **LineNumberRenderable APIs**: Use `setLineColor()` and `setLineSign()` instead of absolute-positioned overlays. This integrates properly with scrolling.

2. **LineInfo.lineSources**: Use this from CodeRenderable to handle wrapped lines. The mapping between visual lines and logical lines is essential for correct navigation.

3. **Tree-sitter Sharing**: Use a shared `TreeSitterClient` instance across the app to avoid re-initializing parsers.

4. **Diff Content Formatting**: Build the diff content as plain text with +/- prefixes. CodeRenderable will handle display; we add colors via LineNumberRenderable.

5. **Column Tracking**: Track column separately from cursor line. Column is not visually shown (CodeRenderable doesn't have a cursor) but is used for horizontal motions and column memory when moving vertically.

6. **All-Files Mode**: DiffLineMapping handles both modes uniformly. File headers become non-commentable lines in the mapping.

### Why CodeRenderable + LineNumberRenderable

Previous attempts used the `DiffRenderable` component directly, which has these limitations:

1. **Opaque line mapping**: DiffRenderable parses diffs internally and doesn't expose line number mappings
2. **No cursor concept**: It's a display-only component with no way to position a cursor
3. **Overlay positioning**: Required absolute-positioned elements for cursors/indicators, which don't integrate with scrolling properly

The new approach uses lower-level components:

- **CodeRenderable**: Provides syntax highlighting via tree-sitter, exposes `lineInfo` for wrap detection
- **LineNumberRenderable**: Wraps CodeRenderable, provides `setLineColor()`, `highlightLines()`, and `setLineSign()` APIs

This gives us full control over line mapping while keeping syntax highlighting capabilities.
