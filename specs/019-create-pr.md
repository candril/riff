# 016 - Create Pull Request

**Status**: Draft

## Description

Create a new GitHub PR from local changes. Review your changes in neoriff, write a description, and submit the PR - all from the terminal.

## Out of Scope

- Draft PRs (could be added later)
- PR templates (use GitHub's default behavior)
- Assigning reviewers (use GitHub UI or `gh pr edit` after)
- Labels and milestones

## Capabilities

### P1 - MVP

- **Create PR flow**: `gP` opens PR creation flow
- **Title input**: Enter PR title
- **Description editor**: Open `$EDITOR` to write PR description/body
- **Base branch**: Auto-detect or specify base branch (main/master)
- **Preview**: Show summary before creating
- **Submit**: Create PR and show link

### P2 - Enhanced

- **Branch creation**: Create and push branch if on main
- **Commit selection**: Choose which commits to include
- **Template support**: Load PR template if exists

### P3 - Polish

- **Draft option**: Create as draft PR
- **Auto-push**: Push branch if not yet pushed
- **Link issues**: Parse and link referenced issues

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `gP` | Local mode with uncommitted/unpushed changes | Open PR creation flow |

## Flow

### 1. Start PR Creation (`gP`)

Check prerequisites:
- Must have local changes or unpushed commits
- Must be on a feature branch (not main/master)
- Branch must be pushed (or offer to push)

### 2. PR Creation UI

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

### 3. Description Editor

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

### 4. Preview & Submit

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

### 5. Success

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

## Technical Notes

### Using `gh` CLI

```typescript
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
│   └── github.ts             # Add createPullRequest
├── components/
│   └── CreatePrFlow.ts       # New: PR creation UI
└── app.ts                    # Handle gP keybinding
```
