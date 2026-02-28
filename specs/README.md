# Specs

This directory contains feature specifications for neoriff.

## Format

Each spec follows a consistent structure:

- **Status**: `Draft` | `Ready` | `In Progress` | `Done`
- **Description**: What this feature does
- **Out of Scope**: What this feature explicitly does NOT do
- **Capabilities**: Prioritized list (P1 = MVP, P2 = Important, P3 = Nice to have)
- **Technical Notes**: Implementation details, code examples, file structure

## Naming

Specs are numbered sequentially: `NNN-feature-name.md`

## Workflow

1. Create spec as `Draft`
2. Review and refine → `Ready`
3. Begin implementation → `In Progress`
4. Complete and verified → move to `done/` folder

## Current Specs

| # | Name | Status | Description |
|---|------|--------|-------------|
| 000 | [Vision](./000-vision.md) | Ready | Overall product vision and goals |
| 001 | [App Shell](./001-app-shell.md) | Ready | Basic application shell with OpenTUI |
| 002 | [Local Diff View](./002-local-diff-view.md) | Ready | Display local git diffs |
| 003 | [File Navigation](./003-file-navigation.md) | Ready | Navigate between files in a diff |
| 004 | [Local Comments](./004-local-comments.md) | Ready | Add and store comments locally |
| 005 | [File Review Status](./005-file-review-status.md) | Ready | Mark files as viewed/reviewed |
| 006 | [Configuration](./006-configuration.md) | Ready | TOML config with keybinding sequences |
| 007 | [Omni Search](./007-omni-search.md) | Ready | Fuzzy finder for files, comments, actions |
| 008 | [GitHub Comments](./008-github-comments.md) | Ready | Submit comments to GitHub (single or review) |
| 009 | [GitHub PR Fetch](./009-github-pr-fetch.md) | Ready | Fetch and display GitHub PRs via `gh` CLI |
| 010 | [Comments View](./010-comments-view.md) | In Progress | Dedicated view for browsing threads/comments |
| 011 | [Editor Thread Context](./011-editor-thread-context.md) | Draft | Show thread context when editing comments |
| 012 | [Vim Navigation](./012-vim-navigation.md) | Draft | Vim motions, visual line selection, line mapping |
| 013 | [Virtual Text Comments](./013-virtual-text-comments.md) | Draft | Inline comment previews like nvim virtual text |
| 014 | [Comment Editor Context](./014-comment-editor-context.md) | Draft | Context for comment editor |
| 015 | [Modern Diff Styling](./015-modern-diff-styling.md) | Draft | Modern diff styling improvements |
| 016 | [React Reconciler Migration](./016-react-reconciler-migration.md) | Ready | Migrate to React-style JSX syntax |

## MVP Path

The recommended implementation order for MVP:

1. **001 - App Shell** (P1) - Get the basic app running
2. **002 - Local Diff View** (P1) - Show uncommitted changes
3. **003 - File Navigation** (P1) - Navigate multi-file diffs  
4. **004 - Local Comments** (P1) - Add comments on lines
5. **005 - File Review Status** (P1) - Mark files as viewed

## Future Specs (Not Yet Written)

- `012-data-refresh` - Refresh PR data from GitHub
- `013-resolve-threads` - Mark threads as resolved
