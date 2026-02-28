# 019 - Pull Request Management

**Status**: Draft

## Description

Create new GitHub PRs and edit existing PR metadata from neoriff. View PR info, update title and description, and manage PRs without leaving the terminal.

## Out of Scope

- Draft PRs (could be added later)
- PR templates (use GitHub's default behavior)
- Assigning reviewers (use GitHub UI or `gh pr edit` after)
- Labels and milestones
- Merge/close operations (use `gh pr merge` or GitHub UI)

## Capabilities

### P1 - MVP

- **Create PR flow**: `gP` opens PR creation flow (local mode)
- **Edit PR flow**: `gP` opens PR edit flow (GitHub PR mode)
- **PR metadata display**: Show branch, author, reviewers, status in header
- **Title input**: Enter/edit PR title
- **Description editor**: Open `$EDITOR` to write/edit PR description/body
- **Base branch**: Auto-detect or specify base branch (main/master)
- **Preview**: Show summary before creating/saving
- **Submit**: Create PR or save edits and show result

### P2 - Enhanced

- **Branch creation**: Create and push branch if on main
- **Commit selection**: Choose which commits to include
- **Template support**: Load PR template if exists
- **Reviewers display**: Show requested reviewers and their status

### P3 - Polish

- **Draft option**: Create as draft PR
- **Auto-push**: Push branch if not yet pushed
- **Link issues**: Parse and link referenced issues
- **CI status**: Show checks/CI status in metadata

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `gP` | Local mode with unpushed changes | Open PR creation flow |
| `gP` | GitHub PR mode | Open PR edit flow |

## PR Metadata Display

When viewing a GitHub PR, show metadata in the header area:

```
┌─────────────────────────────────────────────────────────────────┐
│ #123: Add OAuth2 authentication                          [Open] │
├─────────────────────────────────────────────────────────────────┤
│ feature/oauth → main  ·  @alice  ·  3 commits  ·  +142 -38      │
│ Reviewers: @bob (approved) @carol (pending)                     │
└─────────────────────────────────────────────────────────────────┘
```

Metadata fields:
- **PR number and title**: `#123: Title text`
- **Status**: `[Open]`, `[Draft]`, `[Merged]`, `[Closed]`
- **Branches**: `head → base`
- **Author**: `@username`
- **Commit count**: `N commits`
- **Diff stats**: `+additions -deletions`
- **Reviewers**: List with status (approved/changes requested/pending)

## Flows

### Create PR Flow (Local Mode)

#### 1. Start PR Creation (`gP`)

Check prerequisites:
- Must have local changes or unpushed commits
- Must be on a feature branch (not main/master)
- Branch must be pushed (or offer to push)

#### 2. PR Creation UI

```
┌─────────────────────────────────────────────────────────────────┐
│ Create Pull Request                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Branch: feature/my-feature → main                               │
│ Commits: 3 commits ahead                                        │
│                                                                 │
│ Title: ___________________________________________________      │
│                                                                 │
│ [e] Edit description    [Enter] Create PR    [Esc] Cancel       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3. Description Editor

Press `e` to open `$EDITOR` with template:

```markdown
## Summary

<!-- Describe your changes here -->

## Changes

- commit 1 message
- commit 2 message  
- commit 3 message

## Testing

<!-- How was this tested? -->

---
<!-- 
Files changed:
  M src/app.ts
  A src/new-file.ts
  D src/old-file.ts
-->
```

#### 4. Preview & Submit

```
┌─────────────────────────────────────────────────────────────────┐
│ Create Pull Request                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Branch: feature/my-feature → main                               │
│                                                                 │
│ Title: Add new feature for user authentication                  │
│                                                                 │
│ Description:                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ## Summary                                                  │ │
│ │ This PR adds OAuth2 authentication flow...                  │ │
│ │                                                             │ │
│ │ ## Changes                                                  │ │
│ │ - Add OAuth2 provider                                       │ │
│ │ - Update login page                                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Enter] Create PR    [e] Edit    [Esc] Cancel                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 5. Success

```
┌─────────────────────────────────────────────────────────────────┐
│ Pull Request Created!                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ #123: Add new feature for user authentication                   │
│                                                                 │
│ https://github.com/owner/repo/pull/123                          │
│                                                                 │
│ [Enter] Open in browser    [Esc] Close                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Edit PR Flow (GitHub PR Mode)

#### 1. Start PR Edit (`gP`)

When viewing a GitHub PR, `gP` opens the edit flow with current values pre-filled.

#### 2. PR Edit UI

```
┌─────────────────────────────────────────────────────────────────┐
│ Edit Pull Request #123                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Branch: feature/oauth → main  ·  @alice  ·  3 commits           │
│ Status: Open  ·  Reviewers: @bob (approved) @carol (pending)    │
│                                                                 │
│ Title: Add OAuth2 authentication______________________________  │
│                                                                 │
│ [e] Edit description    [Enter] Save    [Esc] Cancel            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3. Description Editor

Press `e` to open `$EDITOR` with the current PR description pre-filled. User can edit and save.

#### 4. Preview & Save

```
┌─────────────────────────────────────────────────────────────────┐
│ Edit Pull Request #123                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Branch: feature/oauth → main                                    │
│                                                                 │
│ Title: Add OAuth2 authentication (updated)                      │
│        ^^^^^^^^^^^^^^^^^^^^^^^^ changed                         │
│                                                                 │
│ Description:                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ## Summary                                                  │ │
│ │ This PR adds OAuth2 authentication flow with Google...      │ │
│ │ (modified)                                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Enter] Save changes    [e] Edit    [Esc] Cancel                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 5. Success

```
┌─────────────────────────────────────────────────────────────────┐
│ Pull Request Updated!                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ #123: Add OAuth2 authentication (updated)                       │
│                                                                 │
│ https://github.com/owner/repo/pull/123                          │
│                                                                 │
│ [Enter] Open in browser    [Esc] Close                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Using `gh` CLI

```typescript
// PR metadata type
interface PrMetadata {
  number: number
  title: string
  body: string
  state: "open" | "closed" | "merged"
  isDraft: boolean
  url: string
  headBranch: string
  baseBranch: string
  author: string
  additions: number
  deletions: number
  commits: number
  reviewers: Array<{
    login: string
    state: "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "COMMENTED"
  }>
}

// Fetch PR metadata
async function getPrMetadata(prNumber: number): Promise<PrMetadata> {
  const result = await $`gh pr view ${prNumber} --json \
    number,title,body,state,isDraft,url,headRefName,baseRefName,\
    author,additions,deletions,commits,reviews`.json()
  
  return {
    number: result.number,
    title: result.title,
    body: result.body,
    state: result.state.toLowerCase(),
    isDraft: result.isDraft,
    url: result.url,
    headBranch: result.headRefName,
    baseBranch: result.baseRefName,
    author: result.author.login,
    additions: result.additions,
    deletions: result.deletions,
    commits: result.commits.length,
    reviewers: result.reviews.map((r: any) => ({
      login: r.author.login,
      state: r.state,
    })),
  }
}

// Create PR
async function createPullRequest(
  title: string,
  body: string,
  base: string = "main"
): Promise<{ number: number; url: string }> {
  const result = await $`gh pr create \
    --title ${title} \
    --body ${body} \
    --base ${base}`.json()
  
  return {
    number: result.number,
    url: result.url,
  }
}

// Edit existing PR
async function editPullRequest(
  prNumber: number,
  title: string,
  body: string
): Promise<{ number: number; url: string }> {
  await $`gh pr edit ${prNumber} \
    --title ${title} \
    --body ${body}`
  
  // Fetch updated PR info
  const result = await $`gh pr view ${prNumber} --json number,url`.json()
  return {
    number: result.number,
    url: result.url,
  }
}

// Get current branch info
async function getBranchInfo(): Promise<{
  current: string
  base: string
  ahead: number
  behind: number
}> {
  const current = await $`git branch --show-current`.text()
  const base = await detectBaseBranch()
  const counts = await $`git rev-list --left-right --count ${base}...HEAD`.text()
  const [behind, ahead] = counts.trim().split('\t').map(Number)
  
  return { current: current.trim(), base, ahead, behind }
}

// Detect base branch (main or master)
async function detectBaseBranch(): Promise<string> {
  try {
    await $`git rev-parse --verify main`
    return "main"
  } catch {
    return "master"
  }
}

// Get commit messages for description template
async function getCommitMessages(base: string): Promise<string[]> {
  const log = await $`git log ${base}..HEAD --format=%s`.text()
  return log.trim().split('\n').filter(Boolean)
}

// Check if branch is pushed
async function isBranchPushed(): Promise<boolean> {
  try {
    await $`git rev-parse @{u}`
    return true
  } catch {
    return false
  }
}

// Push branch
async function pushBranch(): Promise<void> {
  const branch = await $`git branch --show-current`.text()
  await $`git push -u origin ${branch.trim()}`
}
```

### Editor Template

```typescript
function buildPrTemplate(
  commits: string[],
  files: DiffFile[]
): string {
  const lines = [
    "## Summary",
    "",
    "<!-- Describe your changes here -->",
    "",
    "## Changes",
    "",
    ...commits.map(c => `- ${c}`),
    "",
    "## Testing",
    "",
    "<!-- How was this tested? -->",
    "",
    "---",
    "<!-- ",
    "Files changed:",
    ...files.map(f => `  ${f.status[0].toUpperCase()} ${f.filename}`),
    "-->",
  ]
  return lines.join("\n")
}
```

### File Structure

```
src/
├── providers/
│   └── github.ts             # Add getPrMetadata, createPullRequest, editPullRequest
├── components/
│   ├── PrHeader.ts           # New: PR metadata display in header
│   └── PrFlow.ts             # New: PR creation/edit UI (shared component)
└── app.ts                    # Handle gP keybinding (context-aware)
```
