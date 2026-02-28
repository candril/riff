# Flash Navigation

**Status**: Draft

## Description

flash.nvim-style jump navigation for quick cursor positioning. Press a trigger key (e.g., `s`) to enter flash mode, then type search characters. As you type, the view dims except for matches, and each match is labeled with a unique 1-2 character hint. Type the hint characters to instantly jump to that location.

This provides a faster alternative to incremental search (`/`) when you can see your target - you type the search pattern AND the jump label in one fluid motion.

## Out of Scope

- Treesitter-aware jumps (function/class boundaries)
- Remote actions (delete/yank to flash target without moving)
- Multi-window jumps
- Operator-pending mode integration (e.g., `ds{flash}` to delete to target)
- Search history for flash patterns

## Capabilities

### P1 - MVP

**Flash Mode Activation:**
- **Trigger key**: `s` enters flash mode (forward search)
- **Backward trigger**: `S` enters flash mode (backward search)
- **Cancel**: `Esc` or `Ctrl+c` exits flash mode, restores view

**Search Input:**
- **Incremental matching**: As you type, matches update in real-time
- **Min chars**: Start showing matches after 1 character (configurable)
- **Case sensitivity**: Smart case (lowercase = insensitive, any uppercase = sensitive)

**Visual Feedback:**
- **Dim effect**: Non-matching content dims to ~30% opacity
- **Match highlighting**: All matches highlighted with accent color
- **Jump labels**: Each match shows a unique 1-2 character label overlay
- **Label priority**: Closer matches get shorter/easier labels (home row first)

**Jump Execution:**
- **Label input**: Type the label characters to jump to that match
- **Instant jump**: As soon as label is unambiguous, jump immediately
- **Multiple labels**: If many matches, some require 2 characters

**Search Prompt:**
- **Prompt display**: Show `Flash: {pattern}` at bottom of view
- **Match count**: Display number of matches

### P2 - Enhanced

**Label Customization:**
- **Custom labels**: Configure which characters to use for labels
- **Label position**: Option to show label before/after/over match

**Jump Modes:**
- **Line mode**: `gs` to flash jump to line starts only
- **Word mode**: `gw` to flash jump to word starts only

**Visual Enhancements:**
- **Smooth dim**: Animate dim effect (optional)
- **Label backgrounds**: Labels have distinct background for visibility
- **Match preview**: Show line content in prompt when only one match remains

### P3 - Polish

**Integration:**
- **Visual mode**: Flash can extend visual selection
- **Repeat**: `.` repeats last flash jump
- **Jump list**: Flash jumps add to jump list for `Ctrl+o` navigation

**Advanced:**
- **Bi-directional**: Single key for both directions, labels indicate direction
- **Continue search**: After jump, press `s` again to continue from new position

## Technical Notes

### Flash State

```typescript
// src/vim-diff/flash-state.ts

export interface FlashState {
  // Mode
  active: boolean
  direction: "forward" | "backward"
  
  // Search
  pattern: string
  
  // Matches with labels
  matches: FlashMatch[]
  
  // Label input
  labelInput: string         // Characters typed for label selection
  
  // Original position (for cancel)
  originalLine: number
  originalCol: number
  
  // UI state
  dimmedLines: Set<number>   // Lines that should be dimmed
}

export interface FlashMatch {
  line: number               // Visual line index
  col: number                // Column in line
  endCol: number             // End column (exclusive)
  label: string              // 1-2 character jump label
  labelVisible: boolean      // false if filtered out by labelInput
}

export function createFlashState(): FlashState {
  return {
    active: false,
    direction: "forward",
    pattern: "",
    matches: [],
    labelInput: "",
    originalLine: 0,
    originalCol: 0,
    dimmedLines: new Set(),
  }
}
```

### Label Generation

Labels are generated to prioritize:
1. Home row keys (easier to type)
2. Single characters for closest matches
3. Two-character combos for distant matches

```typescript
// src/vim-diff/flash-labels.ts

// Default label characters - home row first, then easy reaches
const DEFAULT_LABELS = "asdfghjklqwertyuiopzxcvbnm"

export interface LabelConfig {
  labels: string             // Characters to use for labels
  maxLabels: number          // Maximum matches to label (default: 50)
}

/**
 * Generate labels for matches, prioritizing closer matches
 */
export function generateLabels(
  matches: Array<{ line: number; col: number }>,
  cursorLine: number,
  config: LabelConfig = { labels: DEFAULT_LABELS, maxLabels: 50 }
): Map<number, string> {
  const { labels, maxLabels } = config
  const labelMap = new Map<number, string>()
  
  // Sort matches by distance from cursor
  const sortedIndices = matches
    .map((m, i) => ({ index: i, distance: Math.abs(m.line - cursorLine) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxLabels)
  
  // Assign single-char labels first, then two-char
  const singleChars = labels.split("")
  const usedLabels = new Set<string>()
  
  for (const { index } of sortedIndices) {
    let label: string | null = null
    
    // Try single character
    for (const char of singleChars) {
      if (!usedLabels.has(char)) {
        label = char
        usedLabels.add(char)
        break
      }
    }
    
    // Fall back to two characters
    if (!label) {
      for (const c1 of singleChars) {
        for (const c2 of singleChars) {
          const combo = c1 + c2
          if (!usedLabels.has(combo)) {
            label = combo
            usedLabels.add(combo)
            break
          }
        }
        if (label) break
      }
    }
    
    if (label) {
      labelMap.set(index, label)
    }
  }
  
  return labelMap
}

/**
 * Filter labels based on typed input
 * Returns matches whose labels start with the input
 */
export function filterByLabelInput(
  matches: FlashMatch[],
  labelInput: string
): FlashMatch[] {
  if (!labelInput) return matches
  
  return matches.filter(m => 
    m.label.toLowerCase().startsWith(labelInput.toLowerCase())
  )
}

/**
 * Check if label input uniquely identifies a match
 */
export function findUniqueMatch(
  matches: FlashMatch[],
  labelInput: string
): FlashMatch | null {
  const filtered = filterByLabelInput(matches, labelInput)
  
  if (filtered.length === 1) {
    return filtered[0]!
  }
  
  // Check for exact match
  const exact = filtered.find(m => 
    m.label.toLowerCase() === labelInput.toLowerCase()
  )
  
  return exact ?? null
}
```

### Flash Handler

```typescript
// src/vim-diff/flash-handler.ts

export class FlashHandler {
  constructor(private opts: {
    getMapping: () => DiffLineMapping
    getFlashState: () => FlashState
    setFlashState: (state: FlashState) => void
    getCursor: () => VimCursorState
    setCursor: (line: number, col: number) => void
    addToJumpList: (line: number) => void
    onUpdate: () => void
  }) {}
  
  /**
   * Enter flash mode
   */
  startFlash(direction: "forward" | "backward"): void {
    const cursor = this.opts.getCursor()
    
    this.opts.setFlashState({
      active: true,
      direction,
      pattern: "",
      matches: [],
      labelInput: "",
      originalLine: cursor.line,
      originalCol: cursor.col,
      dimmedLines: new Set(),
    })
    
    this.opts.onUpdate()
  }
  
  /**
   * Handle character input in flash mode
   */
  handleInput(char: string): void {
    const state = this.opts.getFlashState()
    if (!state.active) return
    
    // Check if this could be a label character
    const potentialLabelInput = state.labelInput + char
    const matchingLabels = filterByLabelInput(state.matches, potentialLabelInput)
    
    if (state.matches.length > 0 && matchingLabels.length > 0) {
      // This is label input
      const uniqueMatch = findUniqueMatch(state.matches, potentialLabelInput)
      
      if (uniqueMatch) {
        // Jump to match!
        this.executeJump(uniqueMatch)
        return
      }
      
      // Update label input and filter visible labels
      this.opts.setFlashState({
        ...state,
        labelInput: potentialLabelInput,
        matches: state.matches.map(m => ({
          ...m,
          labelVisible: m.label.toLowerCase().startsWith(potentialLabelInput.toLowerCase()),
        })),
      })
    } else {
      // This is search pattern input
      const newPattern = state.pattern + char
      this.updatePattern(newPattern)
    }
    
    this.opts.onUpdate()
  }
  
  /**
   * Handle backspace in flash mode
   */
  handleBackspace(): void {
    const state = this.opts.getFlashState()
    if (!state.active) return
    
    if (state.labelInput.length > 0) {
      // Remove from label input
      const newLabelInput = state.labelInput.slice(0, -1)
      this.opts.setFlashState({
        ...state,
        labelInput: newLabelInput,
        matches: state.matches.map(m => ({
          ...m,
          labelVisible: newLabelInput === "" || 
            m.label.toLowerCase().startsWith(newLabelInput.toLowerCase()),
        })),
      })
    } else if (state.pattern.length > 0) {
      // Remove from pattern
      this.updatePattern(state.pattern.slice(0, -1))
    }
    
    this.opts.onUpdate()
  }
  
  /**
   * Update search pattern and find matches
   */
  private updatePattern(pattern: string): void {
    const state = this.opts.getFlashState()
    const cursor = this.opts.getCursor()
    const mapping = this.opts.getMapping()
    
    if (!pattern) {
      this.opts.setFlashState({
        ...state,
        pattern: "",
        matches: [],
        labelInput: "",
        dimmedLines: new Set(),
      })
      return
    }
    
    // Build regex (smart case)
    const hasUppercase = /[A-Z]/.test(pattern)
    const flags = hasUppercase ? "g" : "gi"
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(escaped, flags)
    
    // Find all matches
    const rawMatches: Array<{ line: number; col: number; endCol: number }> = []
    const linesWithMatches = new Set<number>()
    
    const startLine = state.direction === "forward" ? cursor.line : 0
    const endLine = state.direction === "forward" ? mapping.lineCount : cursor.line + 1
    
    for (let i = startLine; i < endLine; i++) {
      const content = mapping.getLineContent(i)
      regex.lastIndex = 0
      
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        // Skip matches before cursor on cursor line (forward)
        if (state.direction === "forward" && i === cursor.line && match.index <= cursor.col) {
          if (match[0]!.length === 0) regex.lastIndex++
          continue
        }
        // Skip matches after cursor on cursor line (backward)
        if (state.direction === "backward" && i === cursor.line && match.index >= cursor.col) {
          if (match[0]!.length === 0) regex.lastIndex++
          continue
        }
        
        rawMatches.push({
          line: i,
          col: match.index,
          endCol: match.index + match[0]!.length,
        })
        linesWithMatches.add(i)
        
        if (match[0]!.length === 0) regex.lastIndex++
      }
    }
    
    // Generate labels
    const labelMap = generateLabels(rawMatches, cursor.line)
    
    // Build FlashMatch array
    const matches: FlashMatch[] = rawMatches.map((m, i) => ({
      ...m,
      label: labelMap.get(i) ?? "",
      labelVisible: true,
    })).filter(m => m.label !== "")
    
    // Calculate dimmed lines (all lines without matches)
    const dimmedLines = new Set<number>()
    for (let i = 0; i < mapping.lineCount; i++) {
      if (!linesWithMatches.has(i)) {
        dimmedLines.add(i)
      }
    }
    
    this.opts.setFlashState({
      ...state,
      pattern,
      matches,
      labelInput: "",
      dimmedLines,
    })
  }
  
  /**
   * Execute jump to match
   */
  private executeJump(match: FlashMatch): void {
    const state = this.opts.getFlashState()
    
    // Add original position to jump list
    this.opts.addToJumpList(state.originalLine)
    
    // Move cursor
    this.opts.setCursor(match.line, match.col)
    
    // Exit flash mode
    this.opts.setFlashState(createFlashState())
    this.opts.onUpdate()
  }
  
  /**
   * Cancel flash mode
   */
  cancelFlash(): void {
    const state = this.opts.getFlashState()
    if (!state.active) return
    
    // Restore cursor position
    this.opts.setCursor(state.originalLine, state.originalCol)
    
    // Exit flash mode
    this.opts.setFlashState(createFlashState())
    this.opts.onUpdate()
  }
}
```

### Visual Rendering

The dim effect is achieved by modifying line colors/opacity:

```typescript
// src/components/VimDiffView.ts - Flash mode integration

function buildFlashLineColors(
  flashState: FlashState,
  theme: Theme
): Map<number, LineColorConfig> {
  const colors = new Map<number, LineColorConfig>()
  
  if (!flashState.active || flashState.matches.length === 0) {
    return colors
  }
  
  // Dim non-matching lines
  for (const line of flashState.dimmedLines) {
    colors.set(line, {
      gutter: theme.surface0,      // Dim gutter
      content: theme.surface0,     // Dim content bg
      fg: theme.overlay0,          // Dim text (~30% opacity effect)
    })
  }
  
  return colors
}

/**
 * Build inline decorations for flash labels
 */
function buildFlashDecorations(
  flashState: FlashState,
  theme: Theme
): Map<number, InlineDecoration[]> {
  const decorations = new Map<number, InlineDecoration[]>()
  
  if (!flashState.active) return decorations
  
  for (const match of flashState.matches) {
    if (!match.labelVisible) continue
    
    const lineDecorations = decorations.get(match.line) || []
    
    // Highlight the match
    lineDecorations.push({
      startCol: match.col,
      endCol: match.endCol,
      bg: theme.yellow,
      fg: theme.base,
    })
    
    // Show label overlay at match position
    lineDecorations.push({
      startCol: match.col,
      endCol: match.col + match.label.length,
      overlay: true,              // Replace content with label
      content: match.label,
      bg: theme.pink,
      fg: theme.base,
      bold: true,
    })
    
    decorations.set(match.line, lineDecorations)
  }
  
  return decorations
}
```

### Flash Prompt Component

```typescript
// src/components/FlashPrompt.ts

export interface FlashPromptProps {
  flashState: FlashState
  theme: Theme
}

export function FlashPrompt({ flashState, theme }: FlashPromptProps): Element {
  if (!flashState.active) {
    return Box({ height: 0 })
  }
  
  const direction = flashState.direction === "forward" ? ">" : "<"
  const matchCount = flashState.matches.filter(m => m.labelVisible).length
  const matchText = matchCount > 0 
    ? `[${matchCount} matches]` 
    : flashState.pattern 
      ? "[No matches]" 
      : ""
  
  return Box(
    { height: 1, width: "100%", backgroundColor: theme.surface0 },
    
    // Mode indicator
    Text({
      content: `Flash ${direction} `,
      fg: theme.pink,
      bold: true,
    }),
    
    // Search pattern
    Text({
      content: flashState.pattern,
      fg: theme.text,
    }),
    
    // Label input (if any)
    flashState.labelInput && Text({
      content: ` → ${flashState.labelInput}`,
      fg: theme.peach,
    }),
    
    // Cursor
    Text({
      content: "_",
      fg: theme.pink,
    }),
    
    // Match count
    Text({
      content: ` ${matchText}`,
      fg: matchCount === 0 && flashState.pattern ? theme.red : theme.subtext0,
    }),
  )
}
```

### Key Handling Integration

```typescript
// In app.ts key handler

// Start flash mode
if (!flashState.active && key.name === "s" && !key.ctrl && !key.alt) {
  if (key.shift) {
    flashHandler.startFlash("backward")
  } else {
    flashHandler.startFlash("forward")
  }
  return true
}

// Flash mode input handling
if (flashState.active) {
  if (key.name === "escape" || (key.name === "c" && key.ctrl)) {
    flashHandler.cancelFlash()
    return true
  }
  
  if (key.name === "backspace") {
    flashHandler.handleBackspace()
    return true
  }
  
  // Regular character input
  if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.alt) {
    flashHandler.handleInput(key.sequence)
    return true
  }
}
```

### Integration with Existing Search

Flash and incremental search (`/`) serve different purposes:

| Feature | Flash (`s`) | Search (`/`) |
|---------|-------------|--------------|
| Purpose | Quick jump to visible target | Find pattern in file |
| Scope | Visible viewport | Full file |
| Visual feedback | Dim + labels | Highlight matches |
| Persistence | One-shot | Persists, `n/N` navigates |
| Best for | "I see where I want to go" | "I need to find X" |

### File Structure

```
src/
  vim-diff/
    flash-state.ts        # FlashState interface
    flash-labels.ts       # Label generation and filtering
    flash-handler.ts      # FlashHandler class
    motion-handler.ts     # Existing (unchanged)
    search-handler.ts     # Existing (unchanged)
  components/
    FlashPrompt.ts        # Flash mode prompt UI
    VimDiffView.ts        # Add flash rendering integration
```

### Configuration

```toml
# config.toml

[flash]
# Characters used for jump labels (home row prioritized)
labels = "asdfghjklqwertyuiopzxcvbnm"

# Maximum number of matches to label
max_labels = 50

# Minimum characters before showing matches (1 or 2)
min_chars = 1

# Enable smart case (lowercase = insensitive)
smart_case = true
```

### Accessibility

- Flash prompt announces match count changes for screen readers
- Labels use high-contrast colors (configurable)
- Dim effect maintains minimum contrast ratio
- All flash functionality available via keyboard

## Visual Mockup

### Initial State (Normal Mode)

```
   1 │ import { Box, Text } from "@opentui/core"
   2 │ 
   3 │ export function Header() {
   4+│   return Box(
   5+│     { height: 1, backgroundColor: "#1a1b26" },
   6+│     Text({ content: "neoriff", fg: "#7aa2f7" })
   7+│   )
   8 │ }
```

### After pressing `s` + typing `Box`

Dimmed lines shown with lighter text, matches highlighted with labels:

```
   1 │ import { [a]Box, Text } from "@opentui/core"  ← bright, "a" label
   2 │                                               ← dimmed
   3 │ export function Header() {                    ← dimmed
   4+│   return [s]Box(                              ← bright, "s" label
   5+│     { height: 1, backgroundColor: "#1a1b26" },← dimmed
   6+│     Text({ content: "neoriff", fg: "#7aa2f7" })← dimmed
   7+│   )                                           ← dimmed
   8 │ }                                             ← dimmed

Flash > Box_ [2 matches]
```

### After typing `s` (the label)

Cursor jumps to line 4, flash mode exits, normal view restored.
