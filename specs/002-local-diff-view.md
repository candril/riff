# Local Diff View

**Status**: Done

## Description

Display a diff of local changes (uncommitted or between commits/branches) with syntax highlighting. This is the foundation for all diff viewing in neoriff.

## Out of Scope

- GitHub PR integration (separate spec)
- Adding comments (separate spec)
- File tree navigation (separate spec)

## Capabilities

### P1 - MVP

- **Show uncommitted changes**: Run with no args to see working directory diff
- **Show changes in current JJ change**: If in a jj repository show changes diff from the current change
- **Syntax highlighting**: Detect filetype from filename
- **Line numbers**: Show line numbers for context
- **Scroll navigation**: j/k for lines, Ctrl+d/u for half-page
- **Exit**: q to quit

### P2 - Branch/Commit Diffs

- **Branch diff**: `neoriff branch:main` compares current to main
- **Commit range**: `neoriff HEAD~3..HEAD` shows recent commits
- **Single commit**: `neoriff HEAD~1` shows last commit
- **Support JJ revset**: Allow jj revsets as input `@-` or `..trunk()`

### P3 - Polish

- **Split view**: Toggle between unified and side-by-side
- **Hunk navigation**: Jump between changes with `]c` / `[c`
- **File info header**: Show filename and change stats (+/- lines)

## Technical Notes

### Getting the Diff

```typescript
// src/providers/local.ts
import { $ } from "bun"

export async function getLocalDiff(target?: string): Promise<string> {
  if (!target) {
    // Uncommitted changes
    const result = await $`git diff`.text()
    return result || await $`git diff --cached`.text()
  }
  
  if (target.startsWith("branch:")) {
    const branch = target.slice(7)
    return await $`git diff ${branch}...HEAD`.text()
  }
  
  // Commit or range
  return await $`git diff ${target}`.text()
}
```

### Using OpenTUI Diff Component

```typescript
import { createCliRenderer, Box, Text, Diff, ScrollBox } from "@opentui/core"

const renderer = await createCliRenderer({ exitOnCtrlC: true })

const diffContent = await getLocalDiff()

renderer.root.add(
  Box(
    { width: "100%", height: "100%", flexDirection: "column" },
    // Header
    Box(
      { height: 1, backgroundColor: "#1a1b26" },
      Text({ content: " neoriff - local changes", fg: "#7aa2f7" })
    ),
    // Diff view
    ScrollBox(
      { flexGrow: 1, scrollbar: true },
      Diff({
        diff: diffContent,
        view: "unified",
        showLineNumbers: true,
      })
    ),
    // Status bar
    Box(
      { height: 1, backgroundColor: "#1a1b26" },
      Text({ content: " j/k: scroll  q: quit", fg: "#565f89" })
    ),
  )
)
```

### Keyboard Handling

```typescript
renderer.keyInput.on("keypress", (key) => {
  switch (key.name) {
    case "j": scrollBox.scrollBy(1); break
    case "k": scrollBox.scrollBy(-1); break
    case "d": if (key.ctrl) scrollBox.scrollBy(Math.floor(height / 2)); break
    case "u": if (key.ctrl) scrollBox.scrollBy(-Math.floor(height / 2)); break
    case "q": renderer.destroy(); process.exit(0); break
  }
})
```

### CLI Argument Parsing

```typescript
// src/index.ts
const args = process.argv.slice(2)
const target = args[0] // undefined, "branch:main", "HEAD~3", etc.

const diff = await getLocalDiff(target)
```

### File Structure

```
src/
├── index.ts              # Entry point, CLI parsing
├── app.ts                # Renderer setup
├── providers/
│   └── local.ts          # Git diff commands
└── components/
    └── DiffView.ts       # Diff display component
```

## Example Usage

```bash
# Uncommitted changes
neoriff

# Compare to main branch
neoriff branch:main

# Last 3 commits
neoriff HEAD~3

# Specific commit range
neoriff abc123..def456
```
