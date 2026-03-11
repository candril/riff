# Vision

**Status**: Ready

## Overview

riff is a terminal-based code review companion focused on reviewing code with minimal distractions. It supports both GitHub PRs (via `gh` CLI) and local changes (commits, branches).

## Core Principles

- **Minimal UI** - Focus on code and comments, nothing else
- **Local-first** - Comments stored locally, synced to GitHub when ready
- **Keyboard-driven** - Full vim-style navigation

## Main Flows

### 1. Diff Review

View and review code changes file by file:
- Navigate between files
- Scroll through diffs with syntax highlighting
- Add comments on specific lines
- Comments stored locally until submitted

### 2. PR Overview

View ongoing conversations and review status:
- List of files with change indicators
- Threads and comments
- Review status (local-only vs synced to GitHub)
- Refresh data from GitHub

## Data Sources

| Source | Command | Description |
|--------|---------|-------------|
| GitHub PR | `riff gh:owner/repo#123` | Fetch PR via `gh` CLI |
| Local branch diff | `riff branch:main` | Compare current branch to target |
| Local commits | `riff HEAD~3` | Review recent commits |
| Uncommitted | `riff` | Review working directory changes |

## Comment Workflow

1. Add comments while reviewing (stored locally in `.riff/`)
2. Preview pending review
3. Submit as GitHub review (or keep local)
4. Indicator shows sync status: `[local]` vs `[synced]`

## Technology

- **UI**: OpenTUI components (Diff, ScrollBox, Text, Box, Input)
- **GitHub**: `gh` CLI for API access
- **Local VCS**: `git` / `jj` commands
- **Storage**: Local JSON files in `.riff/`
