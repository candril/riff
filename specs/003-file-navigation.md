# File Navigation

**Status**: Done

## Description

Navigate between files in a multi-file diff. Shows a collapsible file tree panel in a left sidebar with folder collapsing (single-child folders are merged).

## Out of Scope

- Adding comments
- GitHub integration

## Capabilities

### P1 - MVP

- **File list**: Show list of changed files with +/- stats
- **Current file indicator**: Highlight selected file
- **Navigate files**: `]f` / `[f` to jump between files
- **File count**: Show "File 2/5" in header

### P2 - File Tree Panel

- **Toggle file panel**: `Ctrl+b` to show/hide file tree sidebar
- **Tree view**: Display files in a folder hierarchy
- **Folder collapsing**: Merge single-child folders (e.g., `foo/bar/` shown as one node)
- **Select from tree**: Navigate with j/k, Enter to jump
- **Change indicators**: Color-code added/modified/deleted files
- **Expand/collapse folders**: Toggle folder expansion

### P3 - Polish

- **Filter files**: `/` to filter file list by name
- **Sticky header**: Keep filename visible while scrolling diff
- **Remember panel state**: Persist panel visibility

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

### File Tree Structure

```typescript
// src/utils/file-tree.ts
export interface FileTreeNode {
  name: string           // Display name (may include merged path)
  path: string           // Full path
  isDirectory: boolean
  children?: FileTreeNode[]
  file?: DiffFile        // Present if this is a file node
  expanded?: boolean     // For directories
}

// Example: Given files:
// - foo/bar/index.js
// - foo/bar/main.js  
// - app/stuff.js
//
// Tree becomes:
// foo/bar/          <- merged because foo/ only has bar/
//   index.js
//   main.js
// app/
//   stuff.js

export function buildFileTree(files: DiffFile[]): FileTreeNode[] {
  // Build initial tree
  const root: Map<string, FileTreeNode> = new Map()
  
  for (const file of files) {
    const parts = file.filename.split("/")
    let current = root
    let currentPath = ""
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isFile = i === parts.length - 1
      
      if (!current.has(part)) {
        const node: FileTreeNode = {
          name: part,
          path: currentPath,
          isDirectory: !isFile,
          children: isFile ? undefined : [],
          file: isFile ? file : undefined,
          expanded: true,
        }
        current.set(part, node)
      }
      
      if (!isFile) {
        const node = current.get(part)!
        current = new Map(node.children?.map(c => [c.name, c]) ?? [])
      }
    }
  }
  
  // Collapse single-child directories
  return collapseSingleChildDirs(Array.from(root.values()))
}

function collapseSingleChildDirs(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.map(node => {
    if (!node.isDirectory || !node.children) return node
    
    // Recursively process children first
    let children = collapseSingleChildDirs(node.children)
    
    // If only one child and it's a directory, merge
    while (children.length === 1 && children[0].isDirectory) {
      const child = children[0]
      node = {
        ...node,
        name: `${node.name}/${child.name}`,
        path: child.path,
        children: child.children,
      }
      children = node.children ? collapseSingleChildDirs(node.children) : []
    }
    
    return { ...node, children }
  })
}
```

### State Management

```typescript
// src/state.ts
export interface AppState {
  files: DiffFile[]
  fileTree: FileTreeNode[]
  currentFileIndex: number
  showFilePanel: boolean
  focusedPanel: "files" | "diff"
  selectedTreeIndex: number  // For keyboard navigation in tree
}
```

### Layout with File Tree

```
┌─ neoriff ───────────────────────────────────────────────────────┐
│ src/app.ts (2/5)                                    +12 -3      │
├────────────────┬────────────────────────────────────────────────┤
│ ▼ src/         │  1   import { foo } from "./foo"              │
│    app.ts    M │  2 + import { bar } from "./bar"              │
│    index.ts  M │  3                                             │
│ ▼ components/  │  4   function main() {                        │
│    Header.ts A │  5 -   console.log("hello")                   │
│    Shell.ts  M │  5 +   console.log("hello world")             │
│                │  6   }                                         │
├────────────────┴────────────────────────────────────────────────┤
│ ]f/[f: file  Ctrl+b: toggle panel  j/k: scroll  q: quit        │
└─────────────────────────────────────────────────────────────────┘
```

### Tree Rendering

```typescript
function renderTreeNode(node: FileTreeNode, depth: number, isSelected: boolean): VChild {
  const indent = "  ".repeat(depth)
  const icon = node.isDirectory 
    ? (node.expanded ? "▼ " : "▶ ")
    : "  "
  const statusIcon = node.file ? getStatusIcon(node.file.status) : ""
  
  return Text({
    content: `${indent}${icon}${node.name} ${statusIcon}`,
    fg: isSelected ? colors.primary : getFileColor(node),
    backgroundColor: isSelected ? colors.selection : undefined,
  })
}

function getStatusIcon(status: DiffFile["status"]): string {
  switch (status) {
    case "added": return "A"
    case "modified": return "M"
    case "deleted": return "D"
    case "renamed": return "R"
  }
}
```

### Keyboard Bindings

| Key | Action |
|-----|--------|
| `]f` | Next file |
| `[f` | Previous file |
| `Ctrl+b` | Toggle file panel |
| `j` / `k` | Navigate in focused panel |
| `Enter` | Select file (in tree) / Toggle folder |
| `h` / `l` | Collapse / Expand folder |
| `Tab` | Switch focus between panels |

### File Structure

```
src/
├── state.ts              # App state management
├── utils/
│   ├── diff-parser.ts    # Parse diff into files
│   └── file-tree.ts      # Build file tree with collapsing
└── components/
    ├── DiffView.ts       # Single file diff
    ├── FileTree.ts       # File tree panel component
    └── Header.ts         # File info header
```
