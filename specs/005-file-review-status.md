# File Review Status

**Status**: Ready

## Description

Mark files as viewed/reviewed while going through a diff. This status persists locally and can be synced to GitHub's "Viewed" checkbox on PRs.

## Out of Scope

- GitHub sync (separate spec)
- Partial file review (entire file is viewed or not)

## Capabilities

### P1 - MVP

- **Mark viewed**: Press `v` to mark current file as viewed
- **Unmark viewed**: Press `v` again to toggle off
- **Visual indicator**: Show checkmark or different color for viewed files
- **Progress tracking**: Show "3/5 files reviewed" in header
- **Persist locally**: Save viewed status in `.neoriff/` session

### P2 - Auto & Navigation

- **Auto-mark on leave**: Option to mark file viewed when navigating away
- **Skip viewed**: `]F` to jump to next unreviewed file
- **Review summary**: Show only unreviewed files in file panel

### P3 - Polish

- **Bulk actions**: Mark all as viewed / unviewed
- **Review progress bar**: Visual progress indicator
- **Time tracking**: Track time spent per file

## Technical Notes

### Data Structure

```typescript
// src/types.ts
export interface FileReviewStatus {
  filename: string
  viewed: boolean
  viewedAt?: string      // ISO timestamp
  timeSpent?: number     // Seconds spent on file
}

export interface ReviewSession {
  id: string
  source: string
  createdAt: string
  comments: Comment[]
  fileStatuses: FileReviewStatus[]  // Add this
}
```

### Storage Integration

```typescript
// src/storage.ts
export function markFileViewed(
  session: ReviewSession, 
  filename: string, 
  viewed: boolean
): ReviewSession {
  const existing = session.fileStatuses.find(f => f.filename === filename)
  
  if (existing) {
    existing.viewed = viewed
    existing.viewedAt = viewed ? new Date().toISOString() : undefined
  } else {
    session.fileStatuses.push({
      filename,
      viewed,
      viewedAt: viewed ? new Date().toISOString() : undefined,
    })
  }
  
  return session
}

export function isFileViewed(session: ReviewSession, filename: string): boolean {
  return session.fileStatuses.find(f => f.filename === filename)?.viewed ?? false
}
```

### UI Indicators

File list with review status:

```
┌─ Files (3/5 reviewed) ────────┐
│ ✓ src/index.ts         +12 -3 │
│ ✓ src/utils.ts          +5 -0 │
│   src/components/App.ts +28 -4│
│   src/types.ts          +8 -2 │
│ ✓ README.md             +3 -1 │
└───────────────────────────────┘
```

```typescript
function renderFileItem(file: DiffFile, isViewed: boolean, isSelected: boolean) {
  const icon = isViewed ? "✓" : " "
  const fg = isViewed ? "#565f89" : "#a9b1d6"  // Dimmed if viewed
  
  return Text({
    content: ` ${icon} ${file.filename}`,
    fg: isSelected ? "#7aa2f7" : fg,
    backgroundColor: isSelected ? "#292e42" : undefined,
  })
}
```

### Header Progress

```
┌─ neoriff ─────────────────────────────────────────────────────┐
│ src/index.ts (2/5)  [✓✓○○✓] 3/5 reviewed         +12 -3      │
```

```typescript
function renderProgress(files: DiffFile[], statuses: FileReviewStatus[]) {
  const reviewed = files.filter(f => isFileViewed(session, f.filename)).length
  const total = files.length
  
  // Visual progress: ✓ for reviewed, ○ for pending
  const progress = files.map(f => 
    isFileViewed(session, f.filename) ? "✓" : "○"
  ).join("")
  
  return Text({
    content: `[${progress}] ${reviewed}/${total} reviewed`,
    fg: reviewed === total ? "#9ece6a" : "#7aa2f7",
  })
}
```

### Keyboard Bindings

| Key | Action |
|-----|--------|
| `v` | Toggle viewed status for current file |
| `]F` | Jump to next unreviewed file (P2) |
| `[F` | Jump to previous unreviewed file (P2) |
| `V` | Mark all files as viewed (P3) |

### State Updates

```typescript
// src/state.ts
export interface AppState {
  // ... existing fields
  fileStatuses: Map<string, FileReviewStatus>
}

export function toggleFileViewed(state: AppState, filename: string): AppState {
  const current = state.fileStatuses.get(filename)?.viewed ?? false
  const newStatuses = new Map(state.fileStatuses)
  
  newStatuses.set(filename, {
    filename,
    viewed: !current,
    viewedAt: !current ? new Date().toISOString() : undefined,
  })
  
  return { ...state, fileStatuses: newStatuses }
}

export function nextUnreviewedFile(state: AppState): AppState {
  const startIndex = state.currentFileIndex
  for (let i = 1; i <= state.files.length; i++) {
    const index = (startIndex + i) % state.files.length
    const file = state.files[index]
    if (!state.fileStatuses.get(file.filename)?.viewed) {
      return { ...state, currentFileIndex: index }
    }
  }
  return state // All files reviewed
}
```

### GitHub Mapping (Future)

When syncing to GitHub, map to the PR files viewed API:

```typescript
// Future: src/providers/github.ts
export async function syncViewedStatus(
  prNumber: number, 
  fileStatuses: FileReviewStatus[]
) {
  for (const status of fileStatuses) {
    if (status.viewed) {
      // GitHub GraphQL mutation to mark file as viewed
      await $`gh api graphql -f query='
        mutation {
          markFileAsViewed(input: {
            pullRequestId: "${prId}",
            path: "${status.filename}"
          }) { clientMutationId }
        }
      '`
    }
  }
}
```

### File Structure

```
src/
├── types.ts              # Add FileReviewStatus
├── storage.ts            # Add viewed status persistence
├── state.ts              # Add viewed state management
└── components/
    ├── FileList.ts       # Show viewed indicators
    ├── Header.ts         # Show progress
    └── ProgressBar.ts    # Visual progress (P3)
```
