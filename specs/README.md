# Specs

This directory contains feature specifications for riff.

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
| 017 | [In-View Search](./017-in-view-search.md) | Draft | Search within current view |
| 018 | [Submit Comments](./018-submit-comments.md) | Draft | Submit comments to GitHub |
| 019 | [PR Management](./019-create-pr.md) | Done | Create PRs and edit PR title/description |
| 020 | [Action Menu](./020-action-menu.md) | Draft | Action menu for common operations |
| 021 | [Image Support](./021-image-support.md) | Draft | Drag-drop images in comments |
| 022 | [Flash Navigation](./022-flash-navigation.md) | Done | flash.nvim-style jump navigation with dim effect |
| 023 | [Repo-Local Storage](./023-repo-local-storage.md) | Draft | Store comments in local repo directory |
| 024 | [Commit Picker](./024-commits-panel.md) | Draft | Filter diff by commit via `Ctrl+p #` and `]g`/`[g` navigation |
| 025 | [App Modularization](./025-app-modularization.md) | Draft | Split app.ts into focused modules |
| 026 | [Ignore Patterns](./026-ignore-patterns.md) | Draft | Hide generated/lock files from review |
| 027 | [Leader Key](./027-leader-key.md) | Draft | Leader key for key sequences |
| 028 | [PR Info Panel](./028-pr-info-panel.md) | Draft | Quick view of PR metadata, checks, approvals |
| 029 | [Comment Resolution Status](./029-comment-resolution-status.md) | Draft | Display and toggle comment resolution state |
| 030 | [Viewed Files Sync](./030-viewed-files-sync.md) | Draft | Sync viewed status with GitHub |
| 031 | [Open in Editor](./031-open-in-editor.md) | Draft | Open current file in nvim at cursor line |
| 032 | [Diff Strategies](./032-diff-strategies.md) | Draft | Different diff algorithm strategies |
| 033 | [Comment Sync](./033-comment-sync.md) | Ready | Sync edits and replies to GitHub |
| 034 | [Delete Comments](./034-delete-comments.md) | Draft | Delete comments with safeguard confirmation |
| 042 | [Comment Reactions](./042-comment-reactions.md) | Draft | Add/remove GitHub reactions on PR comments, body, reviews |
| 044 | [Comments Picker](./044-comments-picker.md) | Draft | `gC` fuzzy modal across all comments in the diff |
| 049 | [Local Review Lifecycle](./049-local-review-lifecycle.md) | Done | `riff comments` CLI, Claude handoff, clear, resolved-locally never published |
| 050 | [Tree Filter & Flash to a File](./050-tree-filter-and-file-flash.md) | Done | `/` filters the file tree by path; `s` jumps to a file header |
| 051 | [Long Lines](./051-long-lines.md) | Done | Sidescroll, pinned gutter, overflow markers, `gl` peek, `zw` wrap |
| 052 | [Tree and Diff in Step](./052-tree-and-diff-in-step.md) | Done | Picking a file scrolls the diff; the tree and cursor follow each other |
| 053 | [Markdown Tables](./053-markdown-tables.md) | Done | Cells padded onto one grid in the diff; `gt` draws the table with wrapping cells |
| 054 | [HTML in Comments](./054-html-in-comments.md) | Done | `<br>`, `<details>`, `<b>`, `<a>` translated instead of printed raw |
| 055 | [Visual Selection & Text Objects](./055-visual-selection-and-text-objects.md) | Done | `v` selects charwise, `i`/`a` text objects, viewed moves to `x` |
| 056 | [Search Resume & Collapsed Files](./056-search-resume-and-collapsed-files.md) | Done | `n` revives the pattern after Esc; a search opens the collapsed files it hits |
| 057 | [Following Links](./057-following-links.md) | Done | `gf` follows the link under the cursor; `ge`/`gE` open the current file |
| 058 | [Mermaid Diagrams](./058-mermaid-diagrams.md) | Done | `gl` draws a mermaid block; `Tab` swaps a diagram or table between its versions |
| 059 | [Resolved References](./059-resolved-references.md) | Done | `#412` and pasted GitHub URLs carry the title and state of what they point at |
| 060 | [Code Under an Outdated Comment](./060-code-under-an-outdated-comment.md) | Done | `c` in the comments panel draws the code a comment was written against |
| 061 | [Kept Drafts](./061-kept-drafts.md) | Done | Esc keeps a half-written comment on its line; the composer picks it back up |
| 062 | [Plan: Review Surfaces](./062-review-surfaces-plan.md) | Done | Orchestrates 063–070: three views, one key apart |
| 063 | [Refresh in Place](./063-refresh-in-place.md) | Done | `gr` changes the data and nothing else |
| 064 | [Surfaces & View Switching](./064-surfaces-and-view-switching.md) | Done | `i` state, `a` feed, `d` diff; focus routing and per-view position |
| 065 | [Text Inputs & Filters](./065-text-inputs-and-filters.md) | Done | Real input widgets everywhere; `Ctrl-f` filters the focused view |
| 066 | [Flash Everywhere](./066-flash-everywhere.md) | Done | `s` jumps to a visible row in the tree, info panel and feed |
| 067 | [Info Panel](./067-info-panel.md) | Done | Metadata trimmed, sections at a glance, previews slot |
| 068 | [Preview Links](./068-preview-links.md) | Done | Preview URLs as a list you can open and copy, configurable |
| 069 | [Visit Watermark](./069-visit-watermark.md) | Done | Per-PR memory of your last visit; unseen markers and `]n` |
| 070 | [Activity Feed](./070-activity-feed.md) | Done | `a` shows what happened, filterable by type |
| 071 | [Occurrence Picker](./071-occurrence-picker.md) | Draft | Every place a word appears in the diff, in one list |
| 072 | [Stacked PRs](./072-stacked-prs.md) | Done | Says when the base is another PR, and when that base moved or was rewritten |
| 073 | [Fold Code Blocks](./073-fold-code-blocks.md) | Done | `za`/`zA`/`zo`/`zc`/`zR`/`zM` fold a fenced block like a file |
| 074 | [Expanding Context](./074-expanding-context.md) | Done | `Enter` expands a collapsed run; one spinner, honest end-of-file |
| 075 | [Diff a File in the Editor](./075-diff-in-editor.md) | Done | `gd` / `gD` open both versions side by side, configurable |
| 076 | [Suggestions](./076-suggestions.md) | Done | `Ctrl-y` writes a suggestion block for the lines under review |
| 077 | [Links](./077-links.md) | Done | `gx` lists the links in the PR body or a comment |

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
