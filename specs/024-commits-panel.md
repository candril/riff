# Commit Picker

**Status**: Draft

## Description

Filter the diff view to show changes from a specific commit. Two ways to select:

1. **Omni search**: `Ctrl+p` then type `#` to search commits by message/hash
2. **Quick navigation**: `]g` / `[g` to cycle through commits directly

This integrates with the existing omni-search pattern - no dedicated picker UI needed.

## Out of Scope

- Commit editing (amend, reword, squash)
- Cherry-picking or rebasing
- Commit graph visualization
- Comparing arbitrary commit ranges
- Side-by-side commit comparison
- Dedicated commit picker popup (use `Ctrl+p` with `#` prefix instead)

## Capabilities

### P1 - MVP

- **Omni search integration**: `Ctrl+p` then `#` to search/select commits
- **List commits**: Show commit hash, subject, author, time ago in omni results
- **Fuzzy search**: Type to filter commits by message or hash
- **Select commit**: `Enter` to filter diff to that commit's changes
- **Reset to all**: Select "[All commits]" option to view full diff
- **Next/prev commit**: `]g` / `[g` to cycle through commits in diff view
- **Current indicator**: Header shows which commit is being viewed

### P2 - Enhanced

- **Commit preview**: Show full commit message in omni search preview pane
- **Files in commit**: Show file list for highlighted commit
- **Commit stats**: Show `+X -Y` line counts per commit

### P3 - Polish

- **Author avatars**: Show initials or GitHub avatar
- **CI status**: Show check status for GitHub PR commits
- **Time grouping**: Group commits by "Today", "Yesterday", etc.

## Technical Notes

### User Flow

**Viewing all commits (default):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Diff │ All commits (5) │ src/app.ts                            │
├─────────────────────────────────────────────────────────────────┤
│   40 │   const result = calculate()                             │
│ + 41 │   if (result === null) {                                 │
│ + 42 │     return defaultValue                                  │
├─────────────────────────────────────────────────────────────────┤
│ ]g/[g: cycle commits  Ctrl+p #: search commits                  │
└─────────────────────────────────────────────────────────────────┘
```

**Press `Ctrl+p` then type `#` to search commits:**
```
┌─────────────────────────────────────────────────────────────────┐
│ > #fix                                                          │
├─────────────────────────────────────────────────────────────────┤
│ ● [All commits]                      View complete diff         │
│   abc1234  Fix null pointer          @alice · 2h ago            │
│   jkl3456  Fix typo in readme        @bob · 3d ago              │
├─────────────────────────────────────────────────────────────────┤
│ j/k: navigate  Enter: select  Esc: cancel                       │
└─────────────────────────────────────────────────────────────────┘
```

**After selecting a commit (or pressing `]g`):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Diff │ abc1234: Fix null pointer │ src/app.ts                  │
├─────────────────────────────────────────────────────────────────┤
│   40 │   const result = calculate()                             │
│ + 41 │   if (result === null) {                                 │
│ + 42 │     return defaultValue                                  │
│ + 43 │   }                                                      │
│   44 │   return result                                          │
├─────────────────────────────────────────────────────────────────┤
│ ]g/[g: cycle commits  Ctrl+p #: all commits                     │
└─────────────────────────────────────────────────────────────────┘
```

### Commits Data Structure

```typescript
// src/types.ts

export interface CommitInfo {
  hash: string              // Full commit hash
  shortHash: string         // First 7-8 characters
  subject: string           // First line of commit message
  body?: string             // Rest of commit message
  author: string            // Author name
  authorEmail: string       // Author email
  authorDate: string        // ISO timestamp
  
  // Stats
  filesChanged?: number
  insertions?: number
  deletions?: number
  
  // GitHub-specific (for PRs)
  githubUrl?: string
  verified?: boolean
  ciStatus?: "pending" | "success" | "failure" | "neutral"
}
```

### State Management

```typescript
// src/state.ts

export interface AppState {
  // ... existing fields
  
  // Commits
  commits: CommitInfo[]
  
  // Current view filter
  // null = view all commits combined
  // string = view specific commit hash
  viewingCommit: string | null
  
  // Cached per-commit data
  commitDiffs: Map<string, ParsedDiff>      // hash -> parsed diff
  commitFiles: Map<string, FileInfo[]>      // hash -> files in commit
}
```

### Fetching Commits

**For GitHub PRs:**

```typescript
// src/providers/github.ts

export async function fetchPRCommits(
  owner: string,
  repo: string,
  prNumber: number
): Promise<CommitInfo[]> {
  const result = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/commits --paginate`.json()
  
  return result.map((c: any) => ({
    hash: c.sha,
    shortHash: c.sha.slice(0, 7),
    subject: c.commit.message.split("\n")[0],
    body: c.commit.message.split("\n").slice(1).join("\n").trim() || undefined,
    author: c.commit.author.name,
    authorEmail: c.commit.author.email,
    authorDate: c.commit.author.date,
    githubUrl: c.html_url,
    verified: c.commit.verification?.verified,
  }))
}

// Fetch stats separately (optional, for P2)
export async function fetchCommitStats(
  owner: string,
  repo: string,
  hash: string
): Promise<{ files: number; insertions: number; deletions: number }> {
  const result = await $`gh api repos/${owner}/${repo}/commits/${hash}`.json()
  return {
    files: result.files?.length ?? 0,
    insertions: result.stats?.additions ?? 0,
    deletions: result.stats?.deletions ?? 0,
  }
}
```

**For local git:**

```typescript
// src/providers/local.ts

export async function fetchLocalCommits(
  base: string = "main"
): Promise<CommitInfo[]> {
  const format = "%H%x00%h%x00%s%x00%an%x00%ae%x00%aI"
  const result = await $`git log ${base}..HEAD --format=${format}`.text()
  
  return result.trim().split("\n").filter(Boolean).map(line => {
    const [hash, shortHash, subject, author, authorEmail, authorDate] = line.split("\x00")
    return { hash, shortHash, subject, author, authorEmail, authorDate }
  })
}

// Get stats for a commit
export async function fetchLocalCommitStats(hash: string): Promise<{
  filesChanged: number
  insertions: number
  deletions: number
}> {
  const result = await $`git show ${hash} --stat --format=""`.text()
  const lastLine = result.trim().split("\n").pop() || ""
  
  // Parse "3 files changed, 15 insertions(+), 3 deletions(-)"
  const filesMatch = lastLine.match(/(\d+) files? changed/)
  const insertMatch = lastLine.match(/(\d+) insertions?/)
  const deleteMatch = lastLine.match(/(\d+) deletions?/)
  
  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1]) : 0,
    insertions: insertMatch ? parseInt(insertMatch[1]) : 0,
    deletions: deleteMatch ? parseInt(deleteMatch[1]) : 0,
  }
}
```

**For jj:**

```typescript
// src/providers/local.ts

export async function fetchJJCommits(
  base: string = "trunk()"
): Promise<CommitInfo[]> {
  const template = 'commit_id ++ "\\x00" ++ change_id.short(8) ++ "\\x00" ++ description.first_line() ++ "\\x00" ++ author.name() ++ "\\x00" ++ author.email() ++ "\\x00" ++ author.timestamp() ++ "\\n"'
  
  const result = await $`jj log -r "${base}::@" --no-graph -T ${template}`.text()
  
  return result.trim().split("\n").filter(Boolean).map(line => {
    const [hash, shortHash, subject, author, authorEmail, authorDate] = line.split("\x00")
    return { hash, shortHash, subject, author, authorEmail, authorDate }
  })
}
```

### Fetching Commit Diff

When a commit is selected, fetch its specific diff:

```typescript
// src/providers/github.ts
export async function fetchCommitDiff(
  owner: string,
  repo: string,
  hash: string
): Promise<string> {
  return await $`gh api repos/${owner}/${repo}/commits/${hash} \
    -H "Accept: application/vnd.github.diff"`.text()
}

// src/providers/local.ts
export async function fetchLocalCommitDiff(hash: string): Promise<string> {
  return await $`git show ${hash} --format="" --patch`.text()
}

export async function fetchJJCommitDiff(changeId: string): Promise<string> {
  return await $`jj diff -r ${changeId}`.text()
}
```

### Keyboard Handling - `]g` / `[g` Navigation

```typescript
// In app.ts - key sequence handling

// ]g - Next commit
if (keySequence === "] g") {
  if (state.commits.length === 0) return
  
  if (state.viewingCommit === null) {
    // Currently viewing all → go to first commit
    const firstCommit = state.commits[0]
    await loadCommitDiff(firstCommit.hash)
    state = { ...state, viewingCommit: firstCommit.hash }
  } else {
    // Find current index and go to next
    const currentIndex = state.commits.findIndex(c => c.hash === state.viewingCommit)
    const nextIndex = currentIndex + 1
    
    if (nextIndex >= state.commits.length) {
      // Wrap to "all commits"
      state = { ...state, viewingCommit: null }
    } else {
      const nextCommit = state.commits[nextIndex]
      await loadCommitDiff(nextCommit.hash)
      state = { ...state, viewingCommit: nextCommit.hash }
    }
  }
  render()
  return
}

// [g - Previous commit
if (keySequence === "[ g") {
  if (state.commits.length === 0) return
  
  if (state.viewingCommit === null) {
    // Currently viewing all → go to last commit
    const lastCommit = state.commits[state.commits.length - 1]
    await loadCommitDiff(lastCommit.hash)
    state = { ...state, viewingCommit: lastCommit.hash }
  } else {
    // Find current index and go to previous
    const currentIndex = state.commits.findIndex(c => c.hash === state.viewingCommit)
    const prevIndex = currentIndex - 1
    
    if (prevIndex < 0) {
      // Wrap to "all commits"
      state = { ...state, viewingCommit: null }
    } else {
      const prevCommit = state.commits[prevIndex]
      await loadCommitDiff(prevCommit.hash)
      state = { ...state, viewingCommit: prevCommit.hash }
    }
  }
  render()
  return
}

// ]G or [G - Reset to all commits
if (keySequence === "] G" || keySequence === "[ G") {
  state = { ...state, viewingCommit: null }
  render()
  return
}
```

### Navigation Flow

```
     ┌──────────────────────────────────────────────────────┐
     │                                                      │
     ▼                                                      │
┌─────────┐    ]g     ┌─────────┐    ]g     ┌─────────┐    ]g
│   All   │ ───────▶  │ Commit  │ ───────▶  │ Commit  │ ────┘
│ commits │           │    1    │           │    2    │
└─────────┘           └─────────┘           └─────────┘
     ▲                     │                     │
     │        [g           │        [g           │
     └─────────────────────┴─────────────────────┘
```

The cycle is: **All → Commit 1 → Commit 2 → ... → Commit N → All**

### Visual Feedback

When navigating with `]g`/`[g`, show a brief toast notification:

```
┌─────────────────────────────────────────────────────────────────┐
│ Diff │ abc1234: Fix null pointer │ src/app.ts                  │
├─────────────────────────────────────────────────────────────────┤
│   40 │   const result = calculate()                             │
│ + 41 │   if (result === null) {                                 │
│                              ┌────────────────────────────────┐ │
│                              │ Commit 2/5: abc1234            │ │
│                              │ Fix null pointer               │ │
│                              └────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ ]g/[g: cycle commits  #: picker  ]G: all                        │
└─────────────────────────────────────────────────────────────────┘
```

Toast fades after ~1.5 seconds.

```typescript
// Show toast on commit change
function showCommitToast(commit: CommitInfo | null, index: number, total: number) {
  if (commit === null) {
    showToast({ message: "Viewing all commits", duration: 1500 })
  } else {
    showToast({
      message: `Commit ${index + 1}/${total}: ${commit.shortHash}`,
      subtitle: truncate(commit.subject, 40),
      duration: 1500,
    })
  }
}
```

### Integration with Omni Search

The `#` prefix in omni search (`Ctrl+p`) can also trigger commit search:

```typescript
// src/omni/sources/commits.ts

export const commitsSource: OmniSource = {
  prefix: "#",
  name: "commits",
  
  async getItems(query: string, state: AppState): Promise<OmniItem[]> {
    const filtered = filterCommits(state.commits, query)
    
    return [
      {
        id: "all-commits",
        label: "[All commits]",
        description: "View complete diff",
        icon: "●",
        action: () => selectCommit(null),
      },
      ...filtered.map(c => ({
        id: c.hash,
        label: `${c.shortHash}  ${c.subject}`,
        description: `@${c.author} · ${formatTimeAgo(c.authorDate)}`,
        action: () => selectCommit(c.hash),
      })),
    ]
  },
}
```

### Header Display

Show current commit filter in header:

```typescript
function getHeaderSubtitle(state: AppState): string {
  if (state.viewingCommit === null) {
    return `All commits (${state.commits.length})`
  }
  
  const commit = state.commits.find(c => c.hash === state.viewingCommit)
  if (commit) {
    return `${commit.shortHash}: ${truncate(commit.subject, 30)}`
  }
  
  return state.viewingCommit.slice(0, 7)
}
```

### File Panel Updates

When viewing a single commit, the file panel shows only files changed in that commit:

```typescript
function getVisibleFiles(state: AppState): FileInfo[] {
  if (state.viewingCommit === null) {
    // All files across all commits
    return state.files
  }
  
  // Files changed in this specific commit
  return state.commitFiles.get(state.viewingCommit) || []
}
```

### Configuration

```toml
# config.toml

[keys]
next_commit = "] g"
prev_commit = "[ g"
# Commit search via Ctrl+p with # prefix (uses omni search)
```

### File Structure

```
src/
├── providers/
│   ├── github.ts         # fetchPRCommits, fetchCommitDiff
│   └── local.ts          # fetchLocalCommits, fetchJJCommits
├── omni/
│   └── sources/
│       └── commits.ts    # Omni search source for # prefix
├── state.ts              # Add viewingCommit, commits
└── types.ts              # CommitInfo type
```

### Edge Cases

1. **Single commit PR**: Picker still shown, allows toggling between "all" and single
2. **Empty commits**: Hide commit picker option, show only "All commits"
3. **Very long subjects**: Truncate with ellipsis in picker
4. **Filtered commit doesn't exist**: Reset to "All commits"
5. **Force-pushed PR**: Refresh commits list on `R`, may invalidate current selection
6. **Comments on filtered view**: Comments still persist, shown when that file/line is visible
