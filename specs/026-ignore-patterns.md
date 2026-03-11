# Ignore Patterns

**Status**: Draft

## Description

Hide generated and noisy files from code review. Files matching configurable glob patterns are hidden from the file tree and auto-collapsed in the unified diff view. Useful for lock files, generated code, and build artifacts.

## Out of Scope

- Per-project config (`.riff/config.toml` in repo)
- Per-session override to "un-ignore" specific files
- Separate "Generated Files" section in file tree
- Dimmed display mode (show but grey out)

## Capabilities

### P1 - MVP

- **Global config**: Define patterns in `~/.config/riff/config.toml`
- **Glob patterns**: Standard glob syntax (`**/__generated__/**`, `*.lock`, etc.)
- **Hidden in file tree**: Matching files don't appear in file list
- **Hidden file count**: Show "(+N hidden)" after visible files
- **Collapsed in diff**: Files appear collapsed with stats, can expand manually

### P2 - Discoverability

- **Omni toggle**: `>show hidden` / `>hide ignored` action to toggle visibility
- **Hidden indicator**: When hidden files exist, show hint in status bar

### P3 - Polish

- **Expand all ignored**: Action to expand all collapsed ignored files at once
- **Pattern preview**: `riff --list-ignored` shows which files would be hidden

## Technical Notes

### Configuration

Add `[ignore]` section to config schema:

```toml
# ~/.config/riff/config.toml

[ignore]
# Glob patterns for files to hide/collapse
patterns = [
  # Generated code
  "**/__generated__/**",
  "**/*.generated.*",
  "**/codegen/**",
  "**/*.g.ts",
  "**/*.g.dart",
  
  # Lock files
  "package-lock.json",
  "bun.lockb",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  
  # Snapshots
  "**/__snapshots__/**",
  "**/*.snap",
  
  # Build artifacts
  "**/*.min.js",
  "**/*.min.css",
  "**/*.bundle.js",
  
  # Auto-generated
  "**/*.d.ts",
  "**/*.map",
]
```

### Default Patterns

Ship with sensible defaults that cover common cases:

```typescript
// src/config/defaults.ts
export const defaultIgnorePatterns = [
  // Lock files (most common)
  "package-lock.json",
  "bun.lockb", 
  "yarn.lock",
  "pnpm-lock.yaml",
  
  // Generated code markers
  "**/__generated__/**",
  "**/*.generated.*",
  
  // Snapshots
  "**/__snapshots__/**",
  "**/*.snap",
]
```

### Config Schema Update

```typescript
// src/config/schema.ts
export interface Config {
  view: ViewConfig
  colors: ColorConfig
  keys: KeyConfig
  ignore: IgnoreConfig  // New
}

export interface IgnoreConfig {
  patterns: string[]
}
```

### File Matching

```typescript
// src/utils/ignore.ts
import { minimatch } from "minimatch"

export class IgnoreMatcher {
  private patterns: string[]
  
  constructor(patterns: string[]) {
    this.patterns = patterns
  }
  
  isIgnored(filename: string): boolean {
    return this.patterns.some(pattern => 
      minimatch(filename, pattern, { matchBase: true })
    )
  }
  
  partition<T extends { filename: string }>(files: T[]): {
    visible: T[]
    hidden: T[]
  } {
    const visible: T[] = []
    const hidden: T[] = []
    
    for (const file of files) {
      if (this.isIgnored(file.filename)) {
        hidden.push(file)
      } else {
        visible.push(file)
      }
    }
    
    return { visible, hidden }
  }
}
```

### File Tree Update

```typescript
// src/components/FileList.ts
function FileList(props: {
  files: DiffFile[]
  hiddenCount: number
  showHidden: boolean
  // ...
}) {
  const items = props.files.map(file => 
    FileListItem({ file, /* ... */ })
  )
  
  // Show hidden count at the bottom
  if (props.hiddenCount > 0 && !props.showHidden) {
    items.push(
      Text({ 
        content: `  (+${props.hiddenCount} hidden)`,
        fg: config.colors.viewed_fg,  // Dimmed
      })
    )
  }
  
  return ScrollBox({ /* ... */ }, ...items)
}
```

### Unified Diff View Update

Ignored files render as collapsed headers:

```typescript
// src/components/DiffView.ts
function IgnoredFileHeader(props: {
  file: DiffFile
  isExpanded: boolean
  onToggle: () => void
}) {
  const icon = props.isExpanded ? "▼" : "▸"
  const stats = `+${props.file.additions}/-${props.file.deletions}`
  
  return Box(
    { height: 1, backgroundColor: config.colors.header_bg },
    Text({
      content: `${icon} ${props.file.filename}`,
      fg: config.colors.viewed_fg,  // Dimmed
    }),
    Text({
      content: ` (${stats}) [auto-collapsed]`,
      fg: config.colors.viewed_fg,
    })
  )
}
```

### State Management

```typescript
// src/state.ts
export interface AppState {
  // ... existing fields
  
  // Ignore state
  showHiddenFiles: boolean        // Toggle via omni action
  expandedIgnoredFiles: Set<string>  // Manually expanded ignored files
}
```

### Omni Search Integration

Add actions for toggling visibility:

```typescript
// src/omni/sources/actions.ts
export const ignoreActions: Action[] = [
  {
    id: "toggle_hidden_files",
    name: "Toggle hidden files",
    description: "Show/hide ignored files in file tree",
    handler: () => {
      state.showHiddenFiles = !state.showHiddenFiles
    },
  },
  {
    id: "expand_all_ignored",
    name: "Expand all ignored files", 
    description: "Expand all auto-collapsed files in diff view",
    handler: () => {
      for (const file of hiddenFiles) {
        state.expandedIgnoredFiles.add(file.filename)
      }
    },
  },
]
```

### Status Bar Hint

When hidden files exist, show indicator:

```
 j/k: scroll  ]f: next file  v: mark viewed  c: comment  (+3 hidden, >show)
```

### Dependencies

```bash
bun add minimatch
```

Or use Bun's built-in glob (if available):

```typescript
// Alternative: use Bun.Glob
const glob = new Bun.Glob(pattern)
return glob.match(filename)
```

### File Structure

```
src/
├── config/
│   ├── schema.ts         # Add IgnoreConfig
│   └── defaults.ts       # Add defaultIgnorePatterns
├── utils/
│   └── ignore.ts         # IgnoreMatcher class
├── components/
│   ├── FileList.ts       # Hide files, show count
│   └── DiffView.ts       # Collapsed file headers
└── omni/
    └── sources/
        └── actions.ts    # Toggle visibility actions
```

### Example Usage

Given this config:

```toml
[ignore]
patterns = ["package-lock.json", "**/__generated__/**"]
```

And a PR with these files:
- `src/index.ts`
- `src/__generated__/types.ts`
- `src/__generated__/schema.ts`  
- `package-lock.json`
- `README.md`

**File Tree shows:**
```
  src/index.ts
  README.md
  (+3 hidden)
```

**Unified Diff shows:**
```
─── src/index.ts ───────────────────────────
 1│ + import { foo } from "./utils"
 2│   // ...

▸ src/__generated__/types.ts (+50/-10) [auto-collapsed]

▸ src/__generated__/schema.ts (+100/-0) [auto-collapsed]

▸ package-lock.json (+500/-200) [auto-collapsed]

─── README.md ──────────────────────────────
 1│ + ## New feature
```

User can press `Enter` on collapsed header to expand, or use `>show hidden` in omni search to show all.
