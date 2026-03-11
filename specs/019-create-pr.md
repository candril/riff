# 019 - Pull Request Management

**Status**: Done

## Description

Create new GitHub PRs and edit existing PR metadata from neoriff. Both flows use `$EDITOR` with a git-commit-verbose-style template showing the full diff as context.

## Out of Scope

- PR templates (use GitHub's default behavior)
- Assigning reviewers (use GitHub UI or `gh pr edit` after)
- Labels and milestones
- Merge/close operations (use `gh pr merge` or GitHub UI)
- Branch creation (must already be on a feature branch)
- Commit selection

## Implemented

### Create PR (Local Mode)

- **Trigger**: `gP` in local mode, or "Create Pull Request" from action menu (`Ctrl+p`)
- **Editor template**: Opens `$EDITOR` with:
  - Empty title line (first line)
  - Empty body area
  - `# Draft: no` toggle (change to `yes` for draft PR)
  - Scissors line (`# --- >8 ---`)
  - Branch info (e.g., `# Creating PR for: my-feature → main`)
  - File summary (e.g., `# M src/app.ts`)
  - Full diff (syntax highlighted in editors that support `.diff`)
- **Parsing**: Title from first non-empty non-comment line, body from remaining lines before scissors, draft flag from `# Draft:` line
- **Submission**: Uses `gh pr create --title ... --body ... [--draft]`
- **Post-create**: Automatically switches to PR review mode for the newly created PR (loads PR session, reinitializes state)
- **Toast**: Shows PR number and URL for 4 seconds

### Edit PR (GitHub PR Mode)

- **Trigger**: `gP` in PR mode, or "Edit PR Title & Description" from action menu
- **Editor template**: Opens `$EDITOR` with:
  - Current title (first line)
  - Current body
  - Scissors line
  - File summary
  - Full diff
- **Parsing**: Same as create (title + body, before scissors)
- **Submission**: Uses `gh pr edit` to update title and body
- **Post-edit**: Updates local state, shows success toast

### PR Metadata Display

Header shows PR info in a single row:

```
Open  #123  @alice  Add OAuth2 authentication      3/5 reviewed  +142 -38
```

Fields: status badge (colored), PR number, author, title, review progress, diff stats.

In local mode, header shows branch info:

```
riff  my-feature → main  All files (5)
```

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `gP` | Local mode | Create PR (open editor) |
| `gP` | GitHub PR mode | Edit PR title & description |

## Technical Notes

### Key Files

```
src/
├── utils/editor.ts           # openPrCreator(), openPrEditor(), parsing functions
├── providers/github.ts       # createPullRequest(), editPullRequest(), loadPrSession()
├── providers/local.ts        # getBranchInfo() for header display
├── app.ts                    # handleCreatePr, handleEditPr handlers
├── app/global-keys.ts        # gP keybinding (context-aware: local vs PR mode)
├── features/action-menu/
│   └── execute.ts            # Action handler dispatch
├── actions/registry.ts       # Action definitions (create-pr, edit-pr)
├── components/Header.ts      # PR metadata + branch info display
└── state.ts                  # branchInfo field on AppState
```

### Create PR via `gh` CLI

```typescript
const result = await $`gh pr create --title ${title} --body ${body} ${draftArgs} --json number,url`.json()
```

`gh pr create` handles pushing the branch if needed.

### Editor Template Format

Both create and edit use the same scissors-line convention from `git commit --verbose`:

```
Title goes here

Body goes here (multiple paragraphs ok)

# Draft: no
# ------------------------ >8 ------------------------
# Do not modify or remove the line above.
# Everything below it will be ignored.
#
# Creating PR for: my-feature → main
#
# Files changed:
#   M src/app.ts
#   A src/new-file.ts
#
diff --git a/src/app.ts b/src/app.ts
...
```

### Post-Create Mode Switch

After PR creation, the app reinitializes into PR mode:
1. Calls `loadPrSession(prNumber)` to fetch PR data, diff, comments
2. Rebuilds state with `createInitialState()` in PR mode
3. Resets vim cursor and search state
4. Updates head SHA for commit tracking
