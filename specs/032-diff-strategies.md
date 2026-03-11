# Alternate Diff Strategies

**Status**: Draft

## Description

Support multiple diff rendering strategies beyond the standard unified diff. Different strategies can better highlight specific types of changes - structural code changes, word-level edits, large refactors, etc. Users can switch between strategies based on what they're reviewing.

## Out of Scope

- Git difftool configuration
- Three-way merge views
- Building our own AST parser (use difftastic instead)

## Capabilities

### P1 - Difftastic Integration

- **Binary detection**: Check for `difft` binary on startup, graceful fallback if missing
- **Structural diffing**: Use difftastic's AST-aware diff for supported languages
- **Language support**: TypeScript, JavaScript, JSON, Rust, Go, Python, and 50+ others
- **Inline rendering**: Parse difftastic output and render in riff's diff view
- **Move detection**: Show when code moved rather than was deleted and re-added
- **Fallback behavior**: Use unified diff for unsupported files or when difftastic unavailable

### P1 - Split View

- **Side-by-side diff**: Show old file on left, new file on right
- **Synchronized scrolling**: Both sides scroll together
- **Line alignment**: Match corresponding lines across sides
- **Inline highlighting**: Highlight changed portions within lines
- **Toggle shortcut**: Quick switch between unified and split view

### P2 - Word/Character Diff

- **Word-level diff**: Highlight changed words, not whole lines
- **Character-level diff**: For small edits, show exact character changes
- **Semantic tokens**: When possible, diff at token boundaries (strings, identifiers)
- **Whitespace visualization**: Option to show whitespace changes explicitly

### P3 - Additional Strategies

- **Patience diff**: Better handling of large structural changes
- **Histogram diff**: Git's histogram algorithm for cleaner diffs
- **Minimal diff**: Smallest possible diff (fewer context switches)
- **Blame-aware**: Show who last modified surrounding context

## Technical Notes

### Strategy Interface

```typescript
// src/diff/strategies/types.ts

export interface DiffStrategy {
  name: string
  description: string
  
  // Transform raw diff into rendered lines
  render(diff: FileDiff, options: RenderOptions): RenderedDiff
  
  // Whether this strategy supports the given file type
  supports(filename: string): boolean
}

export interface RenderOptions {
  width: number
  theme: Theme
  showLineNumbers: boolean
  tabSize: number
  wordWrap: boolean
}

export interface RenderedDiff {
  lines: RenderedLine[]
  // For split view
  leftLines?: RenderedLine[]
  rightLines?: RenderedLine[]
}

export interface RenderedLine {
  content: string
  lineNumber?: number
  type: "addition" | "deletion" | "context" | "header" | "divider"
  highlights?: Highlight[]
}

export interface Highlight {
  start: number
  end: number
  type: "added" | "removed" | "changed"
}
```

### Difftastic Integration

```typescript
// src/diff/difftastic.ts

import { $ } from "bun"

export interface DifftasticResult {
  available: boolean
  version?: string
}

// Check if difftastic is installed
export async function checkDifftastic(): Promise<DifftasticResult> {
  try {
    const version = await $`difft --version`.text()
    return { available: true, version: version.trim() }
  } catch {
    return { available: false }
  }
}

// Get structural diff using difftastic
export async function getDifftasticDiff(
  oldFile: string,
  newFile: string,
  options?: { context?: number }
): Promise<DifftasticOutput> {
  const args = [
    "--display=inline",      // or "side-by-side" for split view
    "--color=always",        // We'll parse ANSI codes
    "--syntax-highlight=on",
    "--context", String(options?.context ?? 3),
  ]
  
  const output = await $`difft ${args} ${oldFile} ${newFile}`.text()
  return parseDifftasticOutput(output)
}

// For git diffs, use difftastic with git
export async function getGitDifftastic(ref?: string): Promise<DifftasticOutput[]> {
  // GIT_EXTERNAL_DIFF makes git use difftastic
  const env = { GIT_EXTERNAL_DIFF: "difft" }
  const output = await $`git diff ${ref ?? ""}`.env(env).text()
  return parseDifftasticOutput(output)
}

export interface DifftasticOutput {
  files: DifftasticFile[]
}

export interface DifftasticFile {
  path: string
  language: string
  changes: DifftasticChange[]
}

export interface DifftasticChange {
  type: "unchanged" | "novel" | "moved"
  oldLineStart?: number
  newLineStart?: number
  content: string
  // For moved code
  movedFrom?: { line: number; column: number }
  movedTo?: { line: number; column: number }
}
```

### Difftastic Strategy

```typescript
// src/diff/strategies/difftastic.ts

export class DifftasticStrategy implements DiffStrategy {
  name = "difftastic"
  description = "Structural diff (AST-aware)"
  
  private available: boolean = false
  
  async init() {
    const result = await checkDifftastic()
    this.available = result.available
    if (!this.available) {
      console.warn("difftastic not found, falling back to unified diff")
    }
  }
  
  async render(diff: FileDiff, options: RenderOptions): Promise<RenderedDiff> {
    if (!this.available) {
      // Fallback to unified
      return strategies.unified.render(diff, options)
    }
    
    // Get old and new file contents
    const oldContent = await getFileAtRef(diff.oldPath, diff.oldRef)
    const newContent = await getFileAtRef(diff.newPath, diff.newRef)
    
    // Write to temp files and run difftastic
    const result = await getDifftasticDiff(oldContent, newContent)
    
    return this.convertToRenderedDiff(result, options)
  }
  
  private convertToRenderedDiff(
    output: DifftasticOutput,
    options: RenderOptions
  ): RenderedDiff {
    const lines: RenderedLine[] = []
    
    for (const change of output.files[0].changes) {
      switch (change.type) {
        case "unchanged":
          lines.push({
            content: change.content,
            type: "context",
            lineNumber: change.newLineStart,
          })
          break
          
        case "novel":
          // New code - could be addition or deletion based on context
          lines.push({
            content: change.content,
            type: change.newLineStart ? "addition" : "deletion",
            lineNumber: change.newLineStart ?? change.oldLineStart,
            highlights: this.extractHighlights(change),
          })
          break
          
        case "moved":
          // Code that moved - show with special indicator
          lines.push({
            content: change.content,
            type: "context",
            lineNumber: change.newLineStart,
            moved: {
              from: change.movedFrom,
              to: change.movedTo,
            },
          })
          break
      }
    }
    
    return { lines }
  }
  
  supports(filename: string): boolean {
    // Difftastic supports many languages
    // See: https://difftastic.wilfred.me.uk/languages.html
    const supported = [
      ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
      ".json", ".yaml", ".yml", ".toml",
      ".rs", ".go", ".py", ".rb", ".java", ".kt",
      ".c", ".cpp", ".h", ".hpp", ".cs",
      ".html", ".css", ".scss", ".less",
      ".md", ".sh", ".bash", ".zsh",
      // ... many more
    ]
    return supported.some(ext => filename.endsWith(ext))
  }
}
```

### Built-in Strategies

```typescript
// src/diff/strategies/index.ts

export const strategies = {
  unified: new UnifiedDiffStrategy(),
  difftastic: new DifftasticStrategy(),  // P1: AST-aware
  split: new SplitDiffStrategy(),
  word: new WordDiffStrategy(),
}

export type StrategyName = keyof typeof strategies

// Initialize async strategies
export async function initStrategies() {
  await strategies.difftastic.init()
}
```

### Split View Implementation

```typescript
// src/diff/strategies/split.ts

import { diffWords } from "diff"  // npm: diff

export class SplitDiffStrategy implements DiffStrategy {
  name = "split"
  description = "Side-by-side comparison"
  
  render(diff: FileDiff, options: RenderOptions): RenderedDiff {
    const halfWidth = Math.floor((options.width - 3) / 2)  // -3 for divider
    const leftLines: RenderedLine[] = []
    const rightLines: RenderedLine[] = []
    
    for (const hunk of diff.hunks) {
      // Process deletions and additions in parallel
      let oldIdx = 0
      let newIdx = 0
      
      while (oldIdx < hunk.oldLines.length || newIdx < hunk.newLines.length) {
        const oldLine = hunk.oldLines[oldIdx]
        const newLine = hunk.newLines[newIdx]
        
        if (oldLine?.type === "deletion" && newLine?.type === "addition") {
          // Changed line - show both with word highlights
          const highlights = this.computeWordHighlights(oldLine.content, newLine.content)
          leftLines.push({ ...oldLine, highlights: highlights.left })
          rightLines.push({ ...newLine, highlights: highlights.right })
          oldIdx++
          newIdx++
        } else if (oldLine?.type === "deletion") {
          // Only deletion
          leftLines.push(oldLine)
          rightLines.push({ content: "", type: "context" })
          oldIdx++
        } else if (newLine?.type === "addition") {
          // Only addition
          leftLines.push({ content: "", type: "context" })
          rightLines.push(newLine)
          newIdx++
        } else {
          // Context line
          leftLines.push(oldLine || { content: "", type: "context" })
          rightLines.push(newLine || { content: "", type: "context" })
          oldIdx++
          newIdx++
        }
      }
    }
    
    return { lines: [], leftLines, rightLines }
  }
  
  private computeWordHighlights(oldContent: string, newContent: string) {
    const changes = diffWords(oldContent, newContent)
    // Convert to highlight ranges...
  }
  
  supports() { return true }
}
```

### Word Diff Implementation

```typescript
// src/diff/strategies/word.ts

import { diffWordsWithSpace } from "diff"

export class WordDiffStrategy implements DiffStrategy {
  name = "word"
  description = "Word-level changes highlighted"
  
  render(diff: FileDiff, options: RenderOptions): RenderedDiff {
    const lines: RenderedLine[] = []
    
    for (const hunk of diff.hunks) {
      // Group consecutive deletions and additions
      const groups = this.groupChanges(hunk.lines)
      
      for (const group of groups) {
        if (group.type === "context") {
          lines.push(...group.lines)
        } else {
          // Compute word-level diff between old and new
          const oldText = group.deletions.map(l => l.content).join("\n")
          const newText = group.additions.map(l => l.content).join("\n")
          const wordDiff = diffWordsWithSpace(oldText, newText)
          
          // Render with inline highlights
          lines.push(...this.renderWordDiff(wordDiff, group))
        }
      }
    }
    
    return { lines }
  }
  
  supports() { return true }
}
```

### UI Integration

```typescript
// src/components/VimDiffView.ts

export class VimDiffView {
  private strategy: DiffStrategy = strategies.unified
  
  setStrategy(name: StrategyName) {
    this.strategy = strategies[name]
    this.rebuild()
  }
  
  cycleStrategy() {
    const names = Object.keys(strategies) as StrategyName[]
    const currentIdx = names.indexOf(this.strategy.name as StrategyName)
    const nextIdx = (currentIdx + 1) % names.length
    this.setStrategy(names[nextIdx])
  }
}
```

### Split View Layout

For split view, modify the diff container to show two panes:

```typescript
// src/components/SplitDiffView.ts

export class SplitDiffView {
  private leftPane: VimBuffer
  private rightPane: VimBuffer
  private divider: Box
  
  constructor(renderer: Renderer) {
    const halfWidth = Math.floor((renderer.width - 1) / 2)
    
    this.container = Box({
      flexDirection: "row",
      width: "100%",
      height: "100%",
    })
    
    this.leftPane = new VimBuffer({ width: halfWidth, label: "Old" })
    this.divider = Box({ width: 1, backgroundColor: theme.surface0 })
    this.rightPane = new VimBuffer({ width: halfWidth, label: "New" })
    
    this.container.add(this.leftPane, this.divider, this.rightPane)
  }
  
  // Synchronized scrolling
  scroll(delta: number) {
    this.leftPane.scroll(delta)
    this.rightPane.scroll(delta)
  }
}
```

### Keybindings

```typescript
// Default keybindings for diff strategies
const diffStrategyKeys = {
  "v": "cycleStrategy",        // Cycle through strategies
  "V": "selectStrategy",       // Open strategy picker
  "<leader>du": "unified",     // Switch to unified
  "<leader>dd": "difftastic",  // Switch to difftastic (structural)
  "<leader>ds": "split",       // Switch to split
  "<leader>dw": "word",        // Switch to word diff
}
```

### Configuration

```toml
# .riff/config.toml

[diff]
# Default strategy: "unified", "difftastic", "split", "word"
# If difftastic is set but not installed, falls back to unified
default_strategy = "difftastic"

# Difftastic settings
[diff.difftastic]
# Path to difft binary (auto-detected if not set)
# binary = "/opt/homebrew/bin/difft"

# Display mode: "inline" or "side-by-side"
display = "inline"

# Context lines around changes
context = 3

# Show move detection arrows
show_moves = true

# Split view settings
[diff.split]
show_line_numbers = true
synchronized_scroll = true
highlight_words = true

# Word diff settings
[diff.word]
highlight_whitespace = false
min_word_length = 2
```

### Status Bar Indicator

Show current strategy in status bar:

```
 src/app.ts [+42 −18]  unified │  j/k: navigate  v: view mode  q: quit
                        ^^^^^^^ current strategy
```

### File Structure

```
src/
├── diff/
│   ├── difftastic.ts         # Difftastic binary integration
│   ├── strategies/
│   │   ├── types.ts          # Strategy interface
│   │   ├── index.ts          # Strategy registry
│   │   ├── unified.ts        # Standard unified diff
│   │   ├── difftastic.ts     # Difftastic structural diff
│   │   ├── split.ts          # Side-by-side view
│   │   └── word.ts           # Word-level highlighting
│   └── algorithms/
│       ├── patience.ts       # Patience diff algorithm
│       └── histogram.ts      # Histogram diff algorithm
├── components/
│   ├── VimDiffView.ts        # Add strategy support
│   └── SplitDiffView.ts      # Split view container
└── config/
    └── schema.ts             # Add diff config options
```

## Visual Mockups

### Unified View (Current)

```
  12 │ function calculate(x: number) {
  13-│   return x * 2
  13+│   return x * 2 + 1
  14 │ }
```

### Split View

```
│  Old                           │  New                           │
│  12 │ function calculate(x) {  │  12 │ function calculate(x) {  │
│  13 │   return x * 2           │  13 │   return x * 2 + 1       │
│                          ^^^                          ^^^^^      │
│  14 │ }                        │  14 │ }                        │
```

### Word Diff View

```
  12 │ function calculate(x: number) {
  13 │   return x * 2[ + 1]
               ─────  +++++
  14 │ }
```

## Visual Mockups (continued)

### Difftastic View (Structural)

Shows semantic understanding - recognizes that code moved rather than was deleted/added:

```
  src/utils/helpers.ts

  12 │ // Utility functions
  13 │ 
  14 │ export function formatDate(date: Date) {
  15 │   return date.toISOString().split("T")[0]
  16 │ }
  17 │
     │ ┄┄┄ moved from line 45 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  18+│ export function formatCurrency(amount: number) {
  19+│   return `$${amount.toFixed(2)}`
  20+│ }
     │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  21 │
  22 │ export function parseNumber(str: string) {
```

Difftastic also understands syntax, so it won't be confused by reformatting:

```
  Before:  items.map(x => x * 2)
  After:   items.map(
             x => x * 2
           )
  
  Difftastic: No semantic changes (just formatting)
  Unified:    Shows 1 deletion, 3 additions
```

## Future Considerations

### Tree-sitter Integration

For even deeper AST analysis without shelling out to difftastic:

- Use tree-sitter WASM bindings for in-process parsing
- Diff AST nodes directly
- Detect refactoring patterns (extract function, rename, inline)
- Show semantic change summaries

This would be faster than shelling out but requires more implementation work.

### Delta Integration

[Delta](https://github.com/dandavison/delta) is another popular diff tool that could be integrated:

- Beautiful syntax highlighting
- Side-by-side view
- Line numbers
- Git integration

Similar integration pattern to difftastic.

### Installation Hints

When difftastic is not found, show a helpful message:

```
Difftastic not found. For better structural diffs, install it:

  brew install difftastic     # macOS
  cargo install difftastic    # Rust/Cargo
  
Using unified diff as fallback.
```
