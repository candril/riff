# File Navigation

**Status**: Ready

## Description

Navigate between files in a multi-file diff. Shows a file list panel and allows jumping between changed files.

## Out of Scope

- Adding comments
- GitHub integration
- File tree (directories) - just flat list

## Capabilities

### P1 - MVP

- **File list**: Show list of changed files with +/- stats
- **Current file indicator**: Highlight selected file
- **Navigate files**: `]f` / `[f` to jump between files
- **File count**: Show "File 2/5" in header

### P2 - File Panel

- **Toggle file panel**: `Ctrl+n` to show/hide file list sidebar
- **Select from list**: Navigate list with j/k, Enter to jump
- **Change indicators**: Color-code added/modified/deleted files

### P3 - Polish

- **Collapse unchanged**: Option to hide files with no changes
- **Filter files**: `/` to filter file list by name
- **Sticky header**: Keep filename visible while scrolling diff

## Technical Notes

### Parsing Files from Diff

```typescript
// src/utils/diff-parser.ts
export interface DiffFile {
  filename: string
  oldFilename?: string  // For renames
  additions: number
  deletions: number
  status: "added" | "modified" | "deleted" | "renamed"
  content: string       // The diff content for this file
}

export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []
  const fileDiffs = diff.split(/^diff --git /m).slice(1)
  
  for (const fileDiff of fileDiffs) {
    const lines = fileDiff.split("\n")
    const headerMatch = lines[0].match(/a\/(.*) b\/(.*)/)
    if (!headerMatch) continue
    
    const [, oldPath, newPath] = headerMatch
    let additions = 0
    let deletions = 0
    
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++
      if (line.startsWith("-") && !line.startsWith("---")) deletions++
    }
    
    files.push({
      filename: newPath,
      oldFilename: oldPath !== newPath ? oldPath : undefined,
      additions,
      deletions,
      status: oldPath === "/dev/null" ? "added" 
            : newPath === "/dev/null" ? "deleted"
            : oldPath !== newPath ? "renamed" 
            : "modified",
      content: "diff --git " + fileDiff,
    })
  }
  
  return files
}
```

### State Management

```typescript
// src/state.ts
export interface AppState {
  files: DiffFile[]
  currentFileIndex: number
  showFilePanel: boolean
}

export function nextFile(state: AppState): AppState {
  return {
    ...state,
    currentFileIndex: Math.min(state.currentFileIndex + 1, state.files.length - 1)
  }
}

export function prevFile(state: AppState): AppState {
  return {
    ...state,
    currentFileIndex: Math.max(state.currentFileIndex - 1, 0)
  }
}
```

### Layout with File Panel

```typescript
// With file panel visible
Box(
  { width: "100%", height: "100%", flexDirection: "row" },
  // File panel (when visible)
  state.showFilePanel && Box(
    { width: 30, borderStyle: "single", flexDirection: "column" },
    Text({ content: " Files", fg: "#7aa2f7" }),
    ...state.files.map((file, i) => 
      Text({
        content: ` ${file.filename}`,
        fg: i === state.currentFileIndex ? "#7aa2f7" : "#a9b1d6",
        backgroundColor: i === state.currentFileIndex ? "#292e42" : undefined,
      })
    )
  ),
  // Diff view
  Box(
    { flexGrow: 1, flexDirection: "column" },
    // ... diff content
  )
)
```

### Header with File Info

```
┌─ neoriff ─────────────────────────────────────────────────────┐
│ src/index.ts (2/5)                              +12 -3        │
├───────────────────────────────────────────────────────────────┤
```

```typescript
Box(
  { height: 1, width: "100%", justifyContent: "space-between" },
  Text({ content: ` ${currentFile.filename} (${index + 1}/${total})` }),
  Text({ 
    content: `+${currentFile.additions} -${currentFile.deletions} `,
    fg: currentFile.additions > currentFile.deletions ? "#9ece6a" : "#f7768e"
  })
)
```

### Keyboard Bindings

| Key | Action |
|-----|--------|
| `]f` | Next file |
| `[f` | Previous file |
| `Ctrl+n` | Toggle file panel |
| `j` / `k` | Navigate file list (when panel focused) |
| `Enter` | Select file from list |

### File Structure

```
src/
├── state.ts              # App state management
├── utils/
│   └── diff-parser.ts    # Parse diff into files
└── components/
    ├── DiffView.ts       # Single file diff
    ├── FileList.ts       # File panel component
    └── Header.ts         # File info header
```
