# Omni Search

**Status**: Ready

## Description

A unified fuzzy finder (`Ctrl+p`) for quick navigation to files, comments, commits, and actions. Inspired by VS Code's command palette and Telescope.

## Out of Scope

- Full-text search within file contents
- External tool integration (ripgrep, fzf)

## Capabilities

### P1 - MVP

- **Open with `Ctrl+p`**: Show omni search overlay
- **Fuzzy matching**: Type to filter results
- **File search**: Jump to any file in the diff
- **Keyboard navigation**: `j/k` or arrows to select, `Enter` to confirm, `Esc` to close
- **Result ranking**: Fuzzy score + recency

### P2 - Multi-source

- **Comments search**: Find by comment text, jump to location
- **Actions search**: Type `>` to search commands/actions
- **Commits search**: Type `#` to search commits (when viewing branch diff)
- **Source prefixes**: `@` files, `>` actions, `#` commits, `/` comments

### P3 - Polish

- **Recent files**: Show recently viewed files first
- **Preview**: Show preview of selected item
- **Highlighted matches**: Show which characters matched
- **Result categories**: Group results by type

## Technical Notes

### Search Modes

| Prefix | Mode | Examples |
|--------|------|----------|
| (none) | All | Mixed results from all sources |
| `@` | Files | `@index` → `src/index.ts` |
| `>` | Actions | `>split` → Toggle split view |
| `#` | Commits | `#fix bug` → Commit messages |
| `/` | Comments | `/logger` → Comments containing "logger" |

### UI Layout

```
┌─ Search ──────────────────────────────────────────────────────┐
│ > fix                                                         │
├───────────────────────────────────────────────────────────────┤
│   src/utils/fix-paths.ts                              @file   │
│ ● src/index.ts:23 - "fix the logger issue"          /comment │
│   Toggle split view                                  >action  │
│   abc123 - Fix login bug                            #commit   │
│   src/components/BugFix.tsx                          @file   │
├───────────────────────────────────────────────────────────────┤
│ ↑↓: navigate  Enter: select  Esc: close  @files >actions     │
└───────────────────────────────────────────────────────────────┘
```

### Data Sources

```typescript
// src/omni/sources.ts
export interface SearchResult {
  id: string
  type: "file" | "comment" | "action" | "commit"
  title: string
  subtitle?: string
  icon?: string
  score: number
  data: unknown  // Type-specific payload
}

export interface SearchSource {
  prefix: string | null  // null = included in "all" search
  search(query: string): SearchResult[]
}
```

### File Source

```typescript
// src/omni/sources/files.ts
export class FileSource implements SearchSource {
  prefix = "@"
  
  constructor(private files: DiffFile[], private recentFiles: string[]) {}
  
  search(query: string): SearchResult[] {
    return this.files
      .map(file => ({
        id: `file:${file.filename}`,
        type: "file" as const,
        title: file.filename,
        subtitle: `+${file.additions} -${file.deletions}`,
        icon: this.getFileIcon(file),
        score: this.fuzzyScore(file.filename, query),
        data: file,
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => {
        // Boost recent files
        const aRecent = this.recentFiles.indexOf(a.title)
        const bRecent = this.recentFiles.indexOf(b.title)
        if (aRecent !== -1 && bRecent === -1) return -1
        if (bRecent !== -1 && aRecent === -1) return 1
        return b.score - a.score
      })
  }
  
  private fuzzyScore(text: string, query: string): number {
    // Simple fuzzy matching
    let score = 0
    let queryIdx = 0
    let consecutiveBonus = 0
    
    for (let i = 0; i < text.length && queryIdx < query.length; i++) {
      if (text[i].toLowerCase() === query[queryIdx].toLowerCase()) {
        score += 1 + consecutiveBonus
        consecutiveBonus += 0.5
        queryIdx++
      } else {
        consecutiveBonus = 0
      }
    }
    
    return queryIdx === query.length ? score : 0
  }
}
```

### Comment Source

```typescript
// src/omni/sources/comments.ts
export class CommentSource implements SearchSource {
  prefix = "/"
  
  constructor(private comments: Comment[]) {}
  
  search(query: string): SearchResult[] {
    return this.comments
      .map(comment => ({
        id: `comment:${comment.id}`,
        type: "comment" as const,
        title: `${comment.filename}:${comment.line}`,
        subtitle: comment.body.slice(0, 50),
        icon: "●",
        score: this.fuzzyScore(comment.body, query),
        data: comment,
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
  }
}
```

### Action Source

```typescript
// src/omni/sources/actions.ts
export interface Action {
  id: string
  name: string
  description: string
  keybinding?: string
  handler: () => void
}

export class ActionSource implements SearchSource {
  prefix = ">"
  
  constructor(private actions: Action[], private keyMapper: KeyMapper) {}
  
  search(query: string): SearchResult[] {
    return this.actions
      .map(action => ({
        id: `action:${action.id}`,
        type: "action" as const,
        title: action.name,
        subtitle: this.keyMapper.getBindingDisplay(action.id) || action.description,
        score: this.fuzzyScore(action.name, query),
        data: action,
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
  }
}

// Available actions
export const actions: Action[] = [
  { id: "toggle_split_view", name: "Toggle split view", description: "Switch between unified and split diff" },
  { id: "toggle_line_numbers", name: "Toggle line numbers", description: "Show/hide line numbers" },
  { id: "toggle_word_wrap", name: "Toggle word wrap", description: "Enable/disable word wrapping" },
  { id: "toggle_file_panel", name: "Toggle file panel", description: "Show/hide file list sidebar" },
  { id: "mark_all_viewed", name: "Mark all files viewed", description: "Mark all files as reviewed" },
  { id: "refresh", name: "Refresh", description: "Refresh data from source" },
  { id: "quit", name: "Quit", description: "Exit neoriff" },
  // ... more actions
]
```

### Omni Search Component

```typescript
// src/components/OmniSearch.ts
import { Box, Text, Input, ScrollBox } from "@opentui/core"

interface OmniSearchState {
  query: string
  results: SearchResult[]
  selectedIndex: number
}

function OmniSearch(
  state: OmniSearchState,
  sources: SearchSource[],
  onSelect: (result: SearchResult) => void,
  onClose: () => void
) {
  return Box(
    {
      position: "absolute",
      top: "20%",
      left: "10%",
      width: "80%",
      height: "60%",
      borderStyle: "rounded",
      backgroundColor: "#1a1b26",
      flexDirection: "column",
    },
    // Header
    Box(
      { height: 1, borderBottom: true },
      Text({ content: " Search", fg: "#7aa2f7" })
    ),
    // Input
    Box(
      { height: 3, padding: 1 },
      Input({
        id: "omni-input",
        value: state.query,
        placeholder: "Type to search... (@files >actions #commits /comments)",
        width: "100%",
        autoFocus: true,
        onChange: (value) => updateSearch(value, sources),
      })
    ),
    // Results
    ScrollBox(
      { flexGrow: 1 },
      ...state.results.map((result, i) =>
        Box(
          {
            height: 1,
            backgroundColor: i === state.selectedIndex ? "#292e42" : undefined,
          },
          Text({
            content: `  ${result.icon || " "} ${result.title}`,
            fg: i === state.selectedIndex ? "#7aa2f7" : "#a9b1d6",
          }),
          Text({
            content: result.subtitle ? `  ${result.subtitle}` : "",
            fg: "#565f89",
          }),
          Text({
            content: `  ${getTypeLabel(result.type)}`,
            fg: "#565f89",
          })
        )
      )
    ),
    // Footer hints
    Box(
      { height: 1, borderTop: true },
      Text({
        content: " ↑↓: navigate  Enter: select  Esc: close",
        fg: "#565f89",
      })
    )
  )
}
```

### Search Coordinator

```typescript
// src/omni/search.ts
export class OmniSearch {
  private sources: SearchSource[]
  
  constructor(sources: SearchSource[]) {
    this.sources = sources
  }
  
  search(query: string): SearchResult[] {
    // Check for prefix
    const prefixMatch = query.match(/^([@>#\/])\s*(.*)$/)
    
    if (prefixMatch) {
      const [, prefix, subQuery] = prefixMatch
      const source = this.sources.find(s => s.prefix === prefix)
      return source ? source.search(subQuery) : []
    }
    
    // Search all sources
    return this.sources
      .flatMap(source => source.search(query))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)  // Limit results
  }
}
```

### Keyboard Handling

```typescript
// In omni search mode
function handleOmniKey(key: KeyEvent, state: OmniSearchState) {
  switch (key.name) {
    case "escape":
      closeOmniSearch()
      break
    case "enter":
      selectResult(state.results[state.selectedIndex])
      closeOmniSearch()
      break
    case "up":
    case "k":
      if (key.ctrl || key.name === "up") {
        state.selectedIndex = Math.max(0, state.selectedIndex - 1)
      }
      break
    case "down":
    case "j":
      if (key.ctrl || key.name === "down") {
        state.selectedIndex = Math.min(state.results.length - 1, state.selectedIndex + 1)
      }
      break
    case "n":
      if (key.ctrl) {
        state.selectedIndex = Math.min(state.results.length - 1, state.selectedIndex + 1)
      }
      break
    case "p":
      if (key.ctrl) {
        state.selectedIndex = Math.max(0, state.selectedIndex - 1)
      }
      break
  }
}
```

### Result Handlers

```typescript
// src/omni/handlers.ts
export function handleResult(result: SearchResult, appState: AppState): AppState {
  switch (result.type) {
    case "file":
      const file = result.data as DiffFile
      const index = appState.files.findIndex(f => f.filename === file.filename)
      return { ...appState, currentFileIndex: index, showOmniSearch: false }
    
    case "comment":
      const comment = result.data as Comment
      const fileIndex = appState.files.findIndex(f => f.filename === comment.filename)
      return { 
        ...appState, 
        currentFileIndex: fileIndex, 
        scrollToLine: comment.line,
        showOmniSearch: false 
      }
    
    case "action":
      const action = result.data as Action
      action.handler()
      return { ...appState, showOmniSearch: false }
    
    case "commit":
      // TODO: Implement commit switching
      return { ...appState, showOmniSearch: false }
    
    default:
      return appState
  }
}
```

### Config Integration

```toml
# In config.toml
[keys]
omni_search = "ctrl+p"
omni_files = "ctrl+o"      # Direct to file search
omni_actions = "ctrl+shift+p"  # Direct to actions
```

### File Structure

```
src/
├── omni/
│   ├── index.ts          # OmniSearch coordinator
│   ├── fuzzy.ts          # Fuzzy matching algorithm
│   ├── handlers.ts       # Result selection handlers
│   └── sources/
│       ├── files.ts      # File search
│       ├── comments.ts   # Comment search
│       ├── actions.ts    # Action/command search
│       └── commits.ts    # Commit search
└── components/
    └── OmniSearch.ts     # UI component
```
