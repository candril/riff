# 029 - Comment Resolution Status

**Status**: Ready

## Description

Show comment resolution progress throughout the UI. Display resolved/total count in the header and per-file resolution status in the file tree. This gives reviewers at-a-glance insight into review progress without switching to Comments View.

## Out of Scope

- Resolving/unresolving threads (covered in spec 010)
- Comment creation/editing (covered in spec 004, 008)
- Full comment list display (covered in spec 010)

## Capabilities

### P1 - MVP

- **Header status**: Show "2/10 Comments resolved" in header
- **File tree indicators**: Show comment counts per file with resolution status
- **Visual distinction**: Clearly differentiate resolved vs unresolved counts
- **Live updates**: Update counts when resolving/unresolving threads

### P2 - Enhanced

- **Filter by status**: Option to show only files with unresolved comments
- **Resolution progress**: Show mini progress indicator (filled/empty dots or bar)
- **Zero state**: Hide indicators for files with no comments

### P3 - Polish

- **Color coding**: Green for all-resolved, yellow for partial, red for none-resolved
- **Collapse resolved**: Option to auto-collapse files with all comments resolved
- **Statistics**: Show resolution rate and time-to-resolution

## UI

### Header Display

The header shows overall comment resolution status:

```
┌─ riff ─────────────────────────────────────────────────────────┐
│ PR #1234  Add dark mode support                                   │
│ alice/dark-mode -> main                      2/10 Comments        │
└───────────────────────────────────────────────────────────────────┘
```

When all resolved:
```
│ alice/dark-mode -> main                      10/10 Comments  ✓    │
```

When none resolved:
```
│ alice/dark-mode -> main                      0/10 Comments   ○    │
```

### File Tree Display

Show per-file comment status with resolution progress:

```
┌─ Files ───────────────────────────┐
│   src/index.ts         +12 -3     │  (no comments - no indicator)
│   src/app.ts      ●2   +28 -4     │  (2 unresolved)
│ ✓ src/utils.ts    3/3  +5 -0      │  (3/3 resolved)
│   src/types.ts    ●1/2 +8 -2      │  (1 unresolved, 1 resolved)
│ ✓ README.md       1/1  +3 -1      │  (1/1 resolved)
└───────────────────────────────────┘
```

### Indicator Legend

| Display | Meaning |
|---------|---------|
| (empty) | No comments on this file |
| `●2` | 2 unresolved comments (no resolved) |
| `✓3` or `3/3` | All 3 comments resolved |
| `●1/3` | 1 unresolved, 2 resolved (1 + 2 = 3 total) |

### Color Scheme

| Status | Color | Used For |
|--------|-------|----------|
| Green (`#9ece6a`) | All resolved | `✓` icon, fully resolved counts |
| Yellow (`#e0af68`) | Partially resolved | Mixed status counts |
| Red/Dim (`#f7768e` or `#565f89`) | None resolved | `●` icon, unresolved-only counts |
| Default | No comments | No indicator shown |

## Technical Notes

### Thread Resolution Tracking

```typescript
// src/types.ts

export interface Thread {
  id: string
  githubThreadId?: string
  filename: string
  line: number
  comments: Comment[]
  resolved: boolean      // Is this thread resolved?
  resolvedAt?: string    // When it was resolved
  resolvedBy?: string    // Who resolved it
}

// Aggregated stats per file
export interface FileCommentStats {
  total: number
  resolved: number
  unresolved: number
}

// Overall stats
export interface CommentStats {
  total: number
  resolved: number
  unresolved: number
  byFile: Map<string, FileCommentStats>
}
```

### Computing Stats

```typescript
// src/utils/comment-stats.ts

export function computeCommentStats(threads: Thread[]): CommentStats {
  const byFile = new Map<string, FileCommentStats>()
  let total = 0
  let resolved = 0
  
  for (const thread of threads) {
    total++
    if (thread.resolved) resolved++
    
    const filename = thread.filename
    const existing = byFile.get(filename) || { total: 0, resolved: 0, unresolved: 0 }
    
    byFile.set(filename, {
      total: existing.total + 1,
      resolved: existing.resolved + (thread.resolved ? 1 : 0),
      unresolved: existing.unresolved + (thread.resolved ? 0 : 1),
    })
  }
  
  return {
    total,
    resolved,
    unresolved: total - resolved,
    byFile,
  }
}

export function getFileCommentStats(
  stats: CommentStats, 
  filename: string
): FileCommentStats | null {
  return stats.byFile.get(filename) || null
}
```

### Header Component Update

```typescript
// src/components/Header.tsx

interface HeaderProps {
  prInfo?: PRInfo
  commentStats: CommentStats
  // ... other props
}

function CommentStatusBadge({ stats }: { stats: CommentStats }) {
  if (stats.total === 0) return null
  
  const allResolved = stats.resolved === stats.total
  const noneResolved = stats.resolved === 0
  
  const icon = allResolved ? "✓" : noneResolved ? "○" : ""
  const color = allResolved 
    ? colors.green 
    : noneResolved 
      ? colors.textDim 
      : colors.yellow
  
  return (
    <Box flexDirection="row" gap={1}>
      <Text fg={color}>
        {stats.resolved}/{stats.total} Comments
      </Text>
      {icon && <Text fg={color}>{icon}</Text>}
    </Box>
  )
}
```

### File Tree Item Update

```typescript
// src/components/FileList.tsx

interface FileItemProps {
  file: DiffFile
  isSelected: boolean
  isViewed: boolean
  commentStats: FileCommentStats | null
}

function FileItem({ file, isSelected, isViewed, commentStats }: FileItemProps) {
  const viewedIcon = isViewed ? "✓" : " "
  
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row">
        <Text fg={colors.textDim}>{viewedIcon} </Text>
        <Text fg={isSelected ? colors.primary : colors.text}>
          {file.filename}
        </Text>
      </Box>
      
      <Box flexDirection="row" gap={1}>
        {/* Comment status */}
        <CommentIndicator stats={commentStats} />
        
        {/* Line changes */}
        <Text fg={colors.green}>+{file.additions}</Text>
        <Text fg={colors.red}>-{file.deletions}</Text>
      </Box>
    </Box>
  )
}

function CommentIndicator({ stats }: { stats: FileCommentStats | null }) {
  if (!stats || stats.total === 0) return null
  
  const allResolved = stats.resolved === stats.total
  const noneResolved = stats.resolved === 0
  
  if (allResolved) {
    // All resolved: show checkmark with count
    return (
      <Text fg={colors.green}>
        ✓{stats.total}
      </Text>
    )
  }
  
  if (noneResolved) {
    // None resolved: show dot with unresolved count
    return (
      <Text fg={colors.red}>
        ●{stats.unresolved}
      </Text>
    )
  }
  
  // Mixed: show unresolved/total
  return (
    <Text fg={colors.yellow}>
      ●{stats.unresolved}/{stats.total}
    </Text>
  )
}
```

### State Integration

```typescript
// src/state.ts

export interface AppState {
  // ... existing fields
  commentStats: CommentStats
}

// Recompute stats when threads change
export function updateCommentStats(state: AppState): AppState {
  const threads = getVisibleThreads(state)
  const commentStats = computeCommentStats(threads)
  return { ...state, commentStats }
}

// Call this after:
// - Loading threads from GitHub
// - Resolving/unresolving a thread
// - Adding/removing a thread
```

### Fetching Resolution Status from GitHub

```typescript
// src/providers/github.ts

export async function fetchThreads(
  owner: string,
  repo: string,
  prNumber: number
): Promise<Thread[]> {
  // Use GraphQL to get thread resolution status
  const result = await $`gh api graphql -f query='
    query {
      repository(owner: "${owner}", name: "${repo}") {
        pullRequest(number: ${prNumber}) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              resolvedBy { login }
              path
              line
              comments(first: 100) {
                nodes {
                  id
                  body
                  author { login }
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  '`.json()
  
  const threads = result.data.repository.pullRequest.reviewThreads.nodes
  
  return threads.map((t: any) => ({
    id: t.comments.nodes[0]?.id || t.id,
    githubThreadId: t.id,
    filename: t.path,
    line: t.line,
    resolved: t.isResolved,
    resolvedBy: t.resolvedBy?.login,
    comments: t.comments.nodes.map(mapComment),
  }))
}
```

### Configuration

```toml
# config.toml

[ui.comments]
# Show comment counts in file tree
show_in_tree = true

# Show resolution status in header  
show_in_header = true

# Color scheme for resolution status
color_all_resolved = "#9ece6a"
color_partial = "#e0af68"  
color_none_resolved = "#f7768e"

# Hide indicator for files with no comments
hide_zero_comments = true
```

### Keyboard Bindings

No new keybindings required. Existing keybindings for navigation and resolution apply.

### File Structure

```
src/
├── utils/
│   └── comment-stats.ts      # Stats computation
├── components/
│   ├── Header.tsx            # Update with CommentStatusBadge
│   └── FileList.tsx          # Update with CommentIndicator
├── providers/
│   └── github.ts             # Add fetchThreads with resolution
└── state.ts                  # Add commentStats to AppState
```

### Edge Cases

1. **No comments**: Hide all comment indicators
2. **Local comments only**: Local comments are always unresolved
3. **Large PRs**: Handle 100+ threads (pagination in GraphQL)
4. **Stale data**: Resolution status may be stale; show refresh hint
5. **Mixed source**: Local + GitHub threads computed separately then merged
