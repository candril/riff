# Virtual Text Comments

**Status**: Draft

## Description

Display comment previews as virtual text at the end of lines, similar to nvim's virtual text feature. This provides inline context without leaving the diff view, showing comment snippets directly on the lines they reference.

## Out of Scope

- Full comment editing inline (use external editor)
- Markdown rendering in virtual text
- Multi-line virtual text blocks
- Virtual text for resolved threads (could be P3)

## Capabilities

### P1 - MVP

- **Virtual text display**: Show truncated comment text at end of line
- **Single comment preview**: First comment in thread shown as virtual text
- **Styling**: Dimmed, italic text to distinguish from code
- **Truncation**: Limit to ~40 chars with ellipsis
- **Toggle**: `gv` to toggle virtual text visibility

### P2 - Enhanced

- **Thread indicator**: Show "(+2)" suffix when thread has multiple comments
- **Author prefix**: Show "@author:" before comment text
- **Scroll awareness**: Only render virtual text for visible lines
- **Status coloring**: Different colors for local/pending/synced

### P3 - Polish

- **Expand on hover/focus**: Show full comment when cursor is on line
- **Resolved threads**: Option to show/hide resolved thread virtual text
- **Custom truncation**: Configurable max length in config

## Technical Notes

### Visual Design

Virtual text appears after the line content, separated by padding:

```
  42 │ + console.log("debug:", result)     @octocat: Use logger instead of con...
  43 │   return result                     @reviewer: Consider extracting (+1)
  44 │   }
```

Key visual properties:
- Left padding from code (3-4 spaces)
- Dimmed foreground color (e.g., `#565f89`)
- Italic style to distinguish from code
- Right-aligned or left-aligned based on available space

### Implementation Approach

Virtual text is rendered as part of the line content in `VimDiffView`. Two approaches:

**Option A: Append to line content**
Modify `buildDiffContent()` to append virtual text to each line.

**Option B: Separate overlay layer**
Use absolutely positioned TextRenderables similar to `CommentIndicators`.

Option A is simpler and integrates with existing syntax highlighting.
Option B allows more precise positioning but adds complexity.

**Recommended: Option A** - simpler, works within existing CodeRenderable.

### VimDiffView Changes

```typescript
// src/components/VimDiffView.ts

export interface VimDiffViewOptions {
  renderer: CliRenderer
  showVirtualText?: boolean  // New option
}

export class VimDiffView {
  // ... existing fields
  private showVirtualText: boolean = true
  
  /**
   * Toggle virtual text visibility
   */
  setShowVirtualText(show: boolean): void {
    this.showVirtualText = show
    this.rebuild()
  }
  
  /**
   * Build diff content string with optional virtual text
   */
  private buildDiffContent(): string {
    if (!this.lineMapping) return ""
    
    const lines: string[] = []
    for (let i = 0; i < this.lineMapping.lineCount; i++) {
      const line = this.lineMapping.getLine(i)!
      let content = this.buildLineContent(line)
      
      // Append virtual text if enabled
      if (this.showVirtualText) {
        const virtualText = this.getVirtualTextForLine(i, line)
        if (virtualText) {
          content = this.appendVirtualText(content, virtualText)
        }
      }
      
      lines.push(content)
    }
    return lines.join("\n")
  }
  
  /**
   * Get virtual text for a specific visual line
   */
  private getVirtualTextForLine(
    visualLine: number, 
    line: DiffMappedLine
  ): string | null {
    // Only show virtual text for content lines
    if (line.type !== "addition" && 
        line.type !== "deletion" && 
        line.type !== "context") {
      return null
    }
    
    // Find comments for this line
    const lineNum = line.newLineNum ?? line.oldLineNum
    if (lineNum === undefined) return null
    
    const filename = line.filename
    const lineComments = this.comments.filter(c => 
      c.filename === filename && c.line === lineNum
    )
    
    if (lineComments.length === 0) return null
    
    // Get first comment (root of thread)
    const first = lineComments.sort((a, b) => 
      a.createdAt.localeCompare(b.createdAt)
    )[0]!
    
    // Build virtual text
    const author = first.author || "you"
    const body = first.body.split("\n")[0]!  // First line only
    const truncated = truncateText(body, 40)
    
    let text = `@${author}: ${truncated}`
    
    // Add thread count if > 1
    if (lineComments.length > 1) {
      text += ` (+${lineComments.length - 1})`
    }
    
    return text
  }
  
  /**
   * Append virtual text to line content with padding
   */
  private appendVirtualText(content: string, virtualText: string): string {
    // Calculate padding to separate from code
    const minPadding = 4
    const contentWidth = stringWidth(content)
    const padding = " ".repeat(minPadding)
    
    return `${content}${padding}${virtualText}`
  }
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 3) + "..."
}
```

### Virtual Text Styling

Virtual text needs distinct styling. Since CodeRenderable doesn't support per-character styling after the fact, we have two sub-approaches:

**Sub-approach A1: Use ANSI escape codes**
Embed ANSI codes directly in the content string for dim/italic styling.

**Sub-approach A2: Use separate LineAfterContent**
Add a new LineNumberRenderable option for "after content" per line.

**Sub-approach A3: Post-render overlay**
Draw virtual text in a post-process pass over the buffer.

**Recommended: A1** - simplest, ANSI codes work in most terminals.

```typescript
// ANSI escape codes for virtual text styling
const DIM = "\x1b[2m"        // Dim
const ITALIC = "\x1b[3m"     // Italic  
const RESET = "\x1b[0m"      // Reset

function appendVirtualText(content: string, virtualText: string): string {
  const padding = "    "  // 4 spaces
  return `${content}${padding}${DIM}${ITALIC}${virtualText}${RESET}`
}
```

### State Management

```typescript
// src/state.ts
export interface AppState {
  // ... existing fields
  showVirtualText: boolean
}

// Initial state
const initialState: AppState = {
  // ...
  showVirtualText: true,  // Enabled by default
}
```

### Keyboard Bindings

| Key | Action |
|-----|--------|
| `gv` | Toggle virtual text visibility |

```typescript
// In key sequence handler
if (sequence === "gv") {
  state = { ...state, showVirtualText: !state.showVirtualText }
  vimDiffView.setShowVirtualText(state.showVirtualText)
  render()
}
```

### Configuration

```toml
# config.toml
[display]
virtual_text = true          # Enable virtual text (default: true)
virtual_text_max_length = 40 # Max characters before truncation
virtual_text_style = "dim"   # Options: "dim", "italic", "dim_italic"
```

```typescript
// src/config/schema.ts
export interface DisplayConfig {
  virtualText: boolean
  virtualTextMaxLength: number
  virtualTextStyle: "dim" | "italic" | "dim_italic"
}
```

### Performance Considerations

- Virtual text is computed during `buildDiffContent()`, not on every cursor move
- Only lines in viewport need processing (inherited from scroll behavior)
- Caching: store computed virtual text and invalidate when comments change
- String operations are cheap; no performance concerns expected

### Integration with Horizontal Scroll

When horizontal scrolling is enabled, virtual text may scroll off screen:

```
Without scroll:
  42 │ + console.log("debug")     @octocat: Use logger...

With scroll left by 10:
  42 │ nsole.log("debug")     @octocat: Use logger...
```

This is acceptable behavior - virtual text scrolls with the line.

### Thread Count Badge

For lines with multiple comments:

```
  42 │ + console.log()     @octocat: First comment here (+2)
                                                         ^^^^
                                                   Thread has 3 comments total
```

### Color Coding by Status (P2)

```typescript
const VIRTUAL_TEXT_COLORS = {
  local: "#7aa2f7",    // Blue - your draft
  pending: "#e0af68",  // Yellow - pending sync  
  synced: "#565f89",   // Gray - synced
}

function getVirtualTextColor(comment: Comment): string {
  return VIRTUAL_TEXT_COLORS[comment.status] || VIRTUAL_TEXT_COLORS.synced
}

// For ANSI color:
function colorize(text: string, hexColor: string): string {
  const rgb = hexToRgb(hexColor)
  return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`
}
```

### Expand on Cursor Line (P3)

When cursor is on a line with truncated virtual text, show full comment:

```
Default (cursor on line 41):
  41 │   const x = 1
> 42 │ + console.log("debug")     @octocat: Use logger instead of console.log...
  43 │   return result

Expanded (cursor moves to 42):
  41 │   const x = 1
> 42 │ + console.log("debug")     @octocat: Use logger instead of console.log. 
  43 │   return result                      The current approach makes it hard to
  44 │   }                                  filter logs in production.
```

This is complex (requires inserting virtual lines) and deferred to P3.

### File Structure

```
src/
├── state.ts                  # Add showVirtualText
├── vim-diff/
│   └── virtual-text.ts       # Virtual text utilities (new)
└── components/
    └── VimDiffView.ts        # Integrate virtual text rendering
```

### Virtual Text Utilities

```typescript
// src/vim-diff/virtual-text.ts

import type { Comment } from "../types"
import type { DiffMappedLine } from "./line-mapping"

export interface VirtualTextOptions {
  maxLength: number
  showAuthor: boolean
  showThreadCount: boolean
  style: "dim" | "italic" | "dim_italic"
}

const DEFAULT_OPTIONS: VirtualTextOptions = {
  maxLength: 40,
  showAuthor: true,
  showThreadCount: true,
  style: "dim_italic",
}

/**
 * Build virtual text for a comment
 */
export function buildVirtualText(
  comments: Comment[],
  options: VirtualTextOptions = DEFAULT_OPTIONS
): string | null {
  if (comments.length === 0) return null
  
  // Sort by creation time, get first
  const sorted = [...comments].sort((a, b) => 
    a.createdAt.localeCompare(b.createdAt)
  )
  const first = sorted[0]!
  
  // Build text parts
  const parts: string[] = []
  
  if (options.showAuthor) {
    parts.push(`@${first.author || "you"}:`)
  }
  
  // First line of comment body
  const firstLine = first.body.split("\n")[0] || ""
  parts.push(truncateText(firstLine, options.maxLength))
  
  // Thread count
  if (options.showThreadCount && comments.length > 1) {
    parts.push(`(+${comments.length - 1})`)
  }
  
  const text = parts.join(" ")
  return applyStyle(text, options.style)
}

/**
 * Apply ANSI styling to text
 */
function applyStyle(text: string, style: VirtualTextOptions["style"]): string {
  const DIM = "\x1b[2m"
  const ITALIC = "\x1b[3m"
  const RESET = "\x1b[0m"
  
  switch (style) {
    case "dim":
      return `${DIM}${text}${RESET}`
    case "italic":
      return `${ITALIC}${text}${RESET}`
    case "dim_italic":
      return `${DIM}${ITALIC}${text}${RESET}`
  }
}

function truncateText(text: string, maxLen: number): string {
  // Remove leading/trailing whitespace
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.slice(0, maxLen - 3) + "..."
}
```

## Dependencies

- Requires comment data from spec 004 (Local Comments)
- Uses line mapping from spec 012 (Vim Navigation)
- Configuration support from spec 006 (Configuration)
