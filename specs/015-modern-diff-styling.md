# Modern Diff Styling

**Status**: Ready

## Description

Improve the visual appearance of file headers and hunk separators in the diff view to create a cleaner, more modern aesthetic. Focus on clarity and readability rather than overloading with symbols.

## Out of Scope

- Changing the actual diff content rendering (additions/deletions)
- Syntax highlighting changes
- Scroll behavior or navigation

## Capabilities

### File Section Headers

- **Multi-line file headers**: Use 2-3 lines for clear visual separation between files
- **Filename prominence**: Make the filename highly visible with accent color
- **Stats display**: Show additions/deletions on their own line or aligned right
- **Subtle decorators**: Use clean box-drawing characters, not heavy symbols
- **Responsive width**: Headers adapt to terminal width

Example design:

```
┌─────────────────────────────────────────────────────────────────────
│  src/components/DiffView.ts
│  +42 added  ·  −18 removed
└─────────────────────────────────────────────────────────────────────
```

Or with rounded corners for a softer look:

```
╭──────────────────────────────────────────────────────────────────────
│  src/components/DiffView.ts
│  +42 added  ·  −18 removed
╰──────────────────────────────────────────────────────────────────────
```

### Hunk Separators (Collapsed Lines)

- **Multi-line hunk separators**: Use 2+ terminal lines for visual clarity
- **Centered label**: Display line count in center
- **Clear boundaries**: Make it obvious where one hunk ends and another begins

Example design (3 lines):

```
        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
                            47 lines
        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
```

## Technical Notes

### Line Mapping Updates

The `DiffLineMapping` class needs to generate multiple visual lines for file headers and dividers. Currently each logical element maps to 1 visual line.

```typescript
// src/vim-diff/types.ts - Add new line types
export type DiffLineType =
  | "file-header-top"     // ┌─────────────
  | "file-header-name"    // │  filename
  | "file-header-stats"   // │  +42  −18
  | "file-header-bottom"  // └─────────────
  | "divider-top"         // ┄┄┄┄┄┄┄┄┄┄┄┄
  | "divider-label"       // 47 lines
  | "divider-bottom"      // ┄┄┄┄┄┄┄┄┄┄┄┄
  | "addition"
  | "deletion"
  | "context"
  // ...existing types
```

### VimDiffView Content Building

Update `buildDiffContent()` to handle multi-line elements:

```typescript
// src/components/VimDiffView.ts

private buildDiffContent(): string {
  if (!this.lineMapping) return ""
  
  const lines: string[] = []
  const termWidth = this.renderer.width - this.gutterWidth
  
  for (let i = 0; i < this.lineMapping.lineCount; i++) {
    const line = this.lineMapping.getLine(i)!

    switch (line.type) {
      case "file-header-top":
        // ┌ followed by ─ to fill width
        lines.push("┌" + "─".repeat(termWidth - 1))
        break
      
      case "file-header-name":
        // │  filename (padded)
        lines.push(`│  ${line.filename}`)
        break
      
      case "file-header-stats":
        // │  +N added  ·  −M removed
        const { additions, deletions } = line.stats
        lines.push(`│  +${additions} added  ·  −${deletions} removed`)
        break
      
      case "file-header-bottom":
        // └ followed by ─ to fill width
        lines.push("└" + "─".repeat(termWidth - 1))
        break
      
      case "divider-top":
      case "divider-bottom":
        // Centered dotted line
        lines.push(centerLine("┄".repeat(40), termWidth))
        break
      
      case "divider-label":
        // Centered "N lines" text
        const label = `${line.hiddenCount} lines`
        lines.push(centerLine(label, termWidth))
        break
      
      // ... existing cases
    }
  }
  return lines.join("\n")
}

function centerLine(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2))
  return " ".repeat(padding) + text
}
```

### Line Colors for New Types

```typescript
// src/components/VimDiffView.ts

private buildLineColors(): Map<number, LineColorConfig> {
  const lineColors = new Map<number, LineColorConfig>()
  
  for (let i = 0; i < this.lineMapping.lineCount; i++) {
    const line = this.lineMapping.getLine(i)
    if (!line) continue

    switch (line.type) {
      // File header - accent gutter, subtle content background
      case "file-header-top":
      case "file-header-bottom":
        lineColors.set(i, { gutter: theme.surface0, content: theme.surface0 })
        break
      
      case "file-header-name":
        lineColors.set(i, { gutter: theme.blue, content: theme.surface1 })
        break
      
      case "file-header-stats":
        lineColors.set(i, { gutter: theme.surface1, content: theme.surface1 })
        break
      
      // Dividers - very subtle, almost invisible background
      case "divider-top":
      case "divider-label":
      case "divider-bottom":
        lineColors.set(i, { gutter: theme.mantle, content: theme.mantle })
        break
      
      // ... existing cases for addition, deletion, context
    }
  }
  
  return lineColors
}
```

### Character Reference

Good unicode box-drawing characters for this use case:

```
File headers:
  ┌ ─ ┐   Box Drawing Light (clean, minimal)
  └ ─ ┘
  │
  
  ╭ ─ ╮   Box Drawing Light Arc (rounded, modern)
  ╰ ─ ╯
  │
  
  ━       Box Drawing Heavy Horizontal (bold accent line)

Dividers/Separators:
  ┄       Box Drawing Light Triple Dash Horizontal
  ┈       Box Drawing Light Quadruple Dash Horizontal
  ─       Box Drawing Light Horizontal (solid)
  ·       Middle Dot (spacing)
  ⋯       Midline Horizontal Ellipsis
  ⎯       Horizontal Line Extension
```

### Hiding Line Numbers

For header/divider lines, hide line numbers and possibly signs:

```typescript
private buildLineNumbers(): { lineNumbers: Map<number, number>; hideLineNumbers: Set<number> } {
  const hideLineNumbers = new Set<number>()
  
  for (let i = 0; i < this.lineMapping.lineCount; i++) {
    const line = this.lineMapping.getLine(i)!
    
    // Hide line numbers for all decorative lines
    if (line.type.startsWith("file-header-") || 
        line.type.startsWith("divider-")) {
      hideLineNumbers.add(i)
    }
  }
  
  return { lineNumbers, hideLineNumbers }
}
```

### File Structure

```
src/
├── vim-diff/
│   ├── types.ts              # Add new line types
│   └── line-mapping.ts       # Generate multi-line headers/dividers
└── components/
    └── VimDiffView.ts        # Render multi-line elements with styling
```

## Visual Mockup

```
┌─────────────────────────────────────────────────────────────────────
│  src/components/Header.ts
│  +12 added  ·  −3 removed
└─────────────────────────────────────────────────────────────────────
   1 │ import { Box, Text } from "@opentui/core"
   2 │ 
   3 │ export function Header() {
   4+│   return Box(
   5+│     { height: 1, backgroundColor: "#1a1b26" },
   6+│     Text({ content: "neoriff", fg: "#7aa2f7" })
   7+│   )
   8 │ }
   9 │ 
        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
                          24 lines
        ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
  34 │ export function Footer() {
  35-│   return null
  36+│   return Box(
  37+│     { height: 1 },
  38+│     Text({ content: "Press ? for help" })
  39+│   )
  40 │ }
```
