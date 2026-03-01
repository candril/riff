# 030 - Viewed Files Sync

**Status**: Ready

## Description

Sync "viewed" file status with GitHub's native "Viewed" checkbox feature. Show when files have changed since being marked as viewed, and provide visual indicators for review freshness. This extends spec 005 (File Review Status) with GitHub sync capabilities.

## Related Specs

- **005 - File Review Status**: Local viewed status (this spec extends it)
- **029 - Comment Resolution Status**: Similar per-file indicators

## Out of Scope

- Time tracking (covered in spec 005)
- Bulk operations beyond mark all/unmark all
- Partial file review (line-by-line)

## Capabilities

### P1 - MVP

- **Viewed indicator**: Show checkbox-style icon when file is marked as viewed
- **Toggle viewed**: `v` to mark/unmark current file as viewed
- **Changed indicator**: Show warning icon if file changed since marked viewed
- **Persist locally**: Save viewed status in session (existing from spec 005)

### P2 - GitHub Sync

- **Sync to GitHub**: Upload viewed status to GitHub PR
- **Sync from GitHub**: Load viewed status from GitHub on PR load
- **Changed detection**: Compare HEAD sha with viewed-at sha
- **Auto-sync option**: Auto-sync viewed status on toggle

### P3 - Polish

- **Bulk viewed**: `V` to mark all files as viewed
- **Outdated filter**: Show only files that changed since viewed
- **Stale warning**: Show "outdated" if file was modified after viewing
- **Review freshness**: Show how long ago each file was reviewed

## UI

### File Tree with Viewed Status

```
┌─ Files (3/5 viewed) ──────────────────┐
│ [✓] src/index.ts           +12 -3     │  Viewed, unchanged
│ [✓!] src/app.ts            +28 -4     │  Viewed, but CHANGED since
│ [ ] src/utils.ts           +5 -0      │  Not viewed
│ [ ] src/types.ts           +8 -2      │  Not viewed  
│ [✓] README.md              +3 -1      │  Viewed, unchanged
└───────────────────────────────────────┘
```

### Icon Legend

| Icon | Meaning | Color |
|------|---------|-------|
| `[✓]` | Viewed, unchanged | Green (`#9ece6a`) |
| `[✓!]` | Viewed, but changed since | Yellow/Orange (`#e0af68`) |
| `[ ]` | Not viewed | Dim (`#565f89`) |
| `[○]` | Syncing to GitHub | Blue (`#7aa2f7`) |

### Alternative Compact Icons

For tighter layouts, use single-character icons:

| Icon | Meaning |
|------|---------|
| `✓` | Viewed, unchanged |
| `⚠` or `!` | Viewed, changed since |
| `○` | Not viewed |
| `◐` | Syncing |

### Header Progress

```
┌─ neoriff ─────────────────────────────────────────────────────────┐
│ PR #1234  Add dark mode                                           │
│ alice/dark-mode -> main       3/5 Viewed  2/10 Comments           │
└───────────────────────────────────────────────────────────────────┘
```

With outdated files:
```
│ alice/dark-mode -> main       3/5 Viewed (1 outdated)  2/10 Cmts  │
```

### Changed Since Viewed - Detail

When a file has changes since it was marked viewed, show details on hover/selection:

```
┌─ src/app.ts ──────────────────────────────────────────────────────┐
│ ⚠ Changed since you viewed (3 new commits)                        │
│   Viewed: 2 hours ago at commit abc1234                           │
│   Latest: def5678                                                 │
├───────────────────────────────────────────────────────────────────┤
│   @@ -40,6 +45,10 @@ ...                                          │
```

## Technical Notes

### Data Structure

```typescript
// src/types.ts

export interface FileViewedStatus {
  filename: string
  viewed: boolean
  viewedAt?: string           // ISO timestamp when marked viewed
  viewedAtCommit?: string     // Commit SHA when marked viewed
  
  // Change detection
  isStale?: boolean           // True if file changed since viewed
  staleCommits?: number       // Number of commits since viewed
  latestCommit?: string       // Current HEAD commit for this file
  
  // GitHub sync
  githubSynced?: boolean      // True if synced to GitHub
  syncedAt?: string           // When last synced to GitHub
}

export interface ViewedStats {
  total: number
  viewed: number
  outdated: number            // Viewed but changed
}
```

### Detecting Changes Since Viewed

```typescript
// src/utils/viewed-status.ts

export interface ChangeDetectionResult {
  isStale: boolean
  commitsBehind: number
  latestCommit: string
}

export async function checkFileChangedSinceViewed(
  filename: string,
  viewedAtCommit: string,
  currentHead: string
): Promise<ChangeDetectionResult> {
  // Get commits that touched this file since viewedAtCommit
  const result = await $`git log --oneline ${viewedAtCommit}..${currentHead} -- ${filename}`.text()
  
  const commits = result.trim().split('\n').filter(Boolean)
  
  return {
    isStale: commits.length > 0,
    commitsBehind: commits.length,
    latestCommit: currentHead,
  }
}

export async function refreshViewedStatuses(
  statuses: FileViewedStatus[],
  currentHead: string
): Promise<FileViewedStatus[]> {
  return Promise.all(
    statuses.map(async (status) => {
      if (!status.viewed || !status.viewedAtCommit) {
        return status
      }
      
      const change = await checkFileChangedSinceViewed(
        status.filename,
        status.viewedAtCommit,
        currentHead
      )
      
      return {
        ...status,
        isStale: change.isStale,
        staleCommits: change.commitsBehind,
        latestCommit: change.latestCommit,
      }
    })
  )
}
```

### GitHub Sync API

GitHub's viewed status is available via GraphQL:

```typescript
// src/providers/github.ts

export async function fetchViewedStatuses(
  owner: string,
  repo: string,
  prNumber: number
): Promise<Map<string, boolean>> {
  const result = await $`gh api graphql -f query='
    query {
      repository(owner: "${owner}", name: "${repo}") {
        pullRequest(number: ${prNumber}) {
          files(first: 100) {
            nodes {
              path
              viewerViewedState
            }
          }
        }
      }
    }
  '`.json()
  
  const files = result.data.repository.pullRequest.files.nodes
  const statuses = new Map<string, boolean>()
  
  for (const file of files) {
    // viewerViewedState: "VIEWED" | "UNVIEWED" | "DISMISSED"
    statuses.set(file.path, file.viewerViewedState === "VIEWED")
  }
  
  return statuses
}

export async function markFileViewedOnGitHub(
  owner: string,
  repo: string,
  prNumber: number,
  path: string,
  viewed: boolean
): Promise<void> {
  const mutation = viewed ? "markFileAsViewed" : "unmarkFileAsViewed"
  
  // First get the PR node ID
  const prResult = await $`gh api graphql -f query='
    query {
      repository(owner: "${owner}", name: "${repo}") {
        pullRequest(number: ${prNumber}) {
          id
        }
      }
    }
  '`.json()
  
  const prId = prResult.data.repository.pullRequest.id
  
  await $`gh api graphql -f query='
    mutation {
      ${mutation}(input: {
        pullRequestId: "${prId}"
        path: "${path}"
      }) {
        pullRequest {
          id
        }
      }
    }
  '`
}
```

### Mark File Viewed Action

```typescript
// src/actions/viewed.ts

export async function toggleFileViewed(
  state: AppState,
  filename: string
): Promise<AppState> {
  const currentStatus = state.viewedStatuses.get(filename)
  const newViewed = !currentStatus?.viewed
  
  // Get current HEAD commit
  const headCommit = await $`git rev-parse HEAD`.text().then(s => s.trim())
  
  const newStatus: FileViewedStatus = {
    filename,
    viewed: newViewed,
    viewedAt: newViewed ? new Date().toISOString() : undefined,
    viewedAtCommit: newViewed ? headCommit : undefined,
    isStale: false,
    staleCommits: 0,
    latestCommit: headCommit,
    githubSynced: false,
  }
  
  const newStatuses = new Map(state.viewedStatuses)
  newStatuses.set(filename, newStatus)
  
  // Optionally sync to GitHub
  if (state.mode === "pr" && state.config.github.auto_sync_viewed) {
    await markFileViewedOnGitHub(
      state.prInfo!.owner,
      state.prInfo!.repo,
      state.prInfo!.number,
      filename,
      newViewed
    )
    newStatus.githubSynced = true
    newStatus.syncedAt = new Date().toISOString()
  }
  
  return {
    ...state,
    viewedStatuses: newStatuses,
    viewedStats: computeViewedStats(newStatuses, state.files),
  }
}
```

### Stats Computation

```typescript
// src/utils/viewed-status.ts

export function computeViewedStats(
  statuses: Map<string, FileViewedStatus>,
  files: DiffFile[]
): ViewedStats {
  let viewed = 0
  let outdated = 0
  
  for (const file of files) {
    const status = statuses.get(file.filename)
    if (status?.viewed) {
      viewed++
      if (status.isStale) {
        outdated++
      }
    }
  }
  
  return {
    total: files.length,
    viewed,
    outdated,
  }
}
```

### File Tree Component

```typescript
// src/components/FileList.tsx

interface FileItemProps {
  file: DiffFile
  isSelected: boolean
  viewedStatus: FileViewedStatus | null
  commentStats: FileCommentStats | null
}

function ViewedCheckbox({ status }: { status: FileViewedStatus | null }) {
  if (!status?.viewed) {
    // Not viewed
    return <Text fg={colors.textDim}>[ ]</Text>
  }
  
  if (status.isStale) {
    // Viewed but file changed
    return <Text fg={colors.yellow}>[✓!]</Text>
  }
  
  // Viewed and current
  return <Text fg={colors.green}>[✓]</Text>
}

function FileItem({ file, isSelected, viewedStatus, commentStats }: FileItemProps) {
  return (
    <Box flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row" gap={1}>
        <ViewedCheckbox status={viewedStatus} />
        <Text fg={isSelected ? colors.primary : colors.text}>
          {file.filename}
        </Text>
      </Box>
      
      <Box flexDirection="row" gap={1}>
        <CommentIndicator stats={commentStats} />
        <Text fg={colors.green}>+{file.additions}</Text>
        <Text fg={colors.red}>-{file.deletions}</Text>
      </Box>
    </Box>
  )
}
```

### On PR Load

```typescript
// src/providers/github.ts

export async function loadPRWithViewedStatus(
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ files: DiffFile[], viewedStatuses: Map<string, FileViewedStatus> }> {
  // Fetch PR files and viewed statuses in parallel
  const [files, githubViewedMap] = await Promise.all([
    fetchPRFiles(owner, repo, prNumber),
    fetchViewedStatuses(owner, repo, prNumber),
  ])
  
  const headCommit = await $`git rev-parse HEAD`.text().then(s => s.trim())
  
  // Build viewed status map
  const viewedStatuses = new Map<string, FileViewedStatus>()
  
  for (const file of files) {
    const isViewed = githubViewedMap.get(file.filename) ?? false
    
    viewedStatuses.set(file.filename, {
      filename: file.filename,
      viewed: isViewed,
      viewedAt: isViewed ? new Date().toISOString() : undefined,
      viewedAtCommit: isViewed ? headCommit : undefined,
      githubSynced: true,
    })
  }
  
  return { files, viewedStatuses }
}
```

### Keyboard Bindings

| Key | Action |
|-----|--------|
| `v` | Toggle viewed status for current file |
| `V` | Mark all files as viewed (P3) |
| `u` | Mark all files as unviewed (P3) |
| `]u` | Jump to next unviewed file |
| `[u` | Jump to previous unviewed file |
| `]o` | Jump to next outdated file (viewed but changed) |

### Configuration

```toml
# config.toml

[github]
# Auto-sync viewed status to GitHub
auto_sync_viewed = true

[ui.viewed]
# Icon style: "checkbox" | "compact" | "none"
icon_style = "checkbox"

# Show outdated count in header
show_outdated_count = true

# Highlight outdated files
highlight_outdated = true
outdated_color = "#e0af68"
```

### State

```typescript
// src/state.ts

export interface AppState {
  // ... existing fields
  
  viewedStatuses: Map<string, FileViewedStatus>
  viewedStats: ViewedStats
}

// Initial state
viewedStatuses: new Map(),
viewedStats: { total: 0, viewed: 0, outdated: 0 },
```

### File Structure

```
src/
├── utils/
│   └── viewed-status.ts      # Stats, change detection
├── providers/
│   └── github.ts             # GitHub sync (fetchViewedStatuses, markFileViewedOnGitHub)
├── actions/
│   └── viewed.ts             # toggleFileViewed, markAllViewed
├── components/
│   ├── FileList.tsx          # ViewedCheckbox component
│   └── Header.tsx            # Viewed stats display
├── storage.ts                # Persist viewed status locally
└── state.ts                  # viewedStatuses, viewedStats
```

### Edge Cases

1. **No GitHub auth**: Show local viewed status only, hide sync indicator
2. **PR updated while reviewing**: Refresh change detection on PR fetch
3. **Force push**: All viewed files become "outdated" 
4. **File renamed**: Track by new filename, mark old as stale
5. **Local mode**: No GitHub sync, only local persistence
6. **Large PRs**: Paginate GitHub API (100+ files)
7. **Offline mode**: Queue sync operations for later
