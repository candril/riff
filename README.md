# riff

A terminal-based code review companion built with [OpenTUI](https://github.com/neurocyte/opentui). Review GitHub PRs and local changes with vim-style navigation and minimal distractions.

## Highlights

- **Vim-style navigation** - Navigate diffs with `hjkl`, `w/b`, `/` search, and more
- **GitHub PR integration** - Fetch PRs, submit reviews, sync comments via `gh` CLI
- **Local diff support** - Review uncommitted changes, branches, or jj revsets
- **Inline comments** - Add comments to specific lines, batch or submit immediately
- **File tree panel** - Browse changed files with fold/unfold and viewed tracking
- **Commit-by-commit review** - Filter diff to view changes from individual commits
- **Syntax highlighting** - Full syntax highlighting via Tree-sitter

## Installation

```bash
# Clone and install
git clone https://github.com/candril/riff.git
cd riff
bun install

# Build standalone binary
bun run build

# Or run directly
bun run src/index.ts
```

## Usage

```bash
# Review uncommitted changes
riff

# Review a GitHub PR (in current repo)
riff 123
riff #123

# Review last 3 commits
riff HEAD~3

# Review changes between branches
riff main..feature-branch

# Review jj revset
riff @-

# Review PR from any repo
riff gh:facebook/react#1234
riff https://github.com/facebook/react/pull/1234
```

## Key Features

### GitHub PR Review

Review PRs directly in your terminal with full comment support:

- **Submit reviews** (`gS`) - Approve, request changes, or comment with batched comments
- **Sync edits** (`gs`) - Edit existing comments or reply to threads, then sync to GitHub
- **PR info panel** (`gi`) - View PR description, conversation, files, and commits
- **Open in browser** (`go`) - Quick jump to PR on GitHub
- **Refresh** (`gr`) - Pull latest changes and comments from GitHub

### Local Diff Review

Works with both git and jj (jujutsu):

- Review uncommitted changes, specific commits, or branch comparisons
- Add comments locally (stored in `.riff/` directory)
- Create PRs from local changes (`gP`)

### Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `h` / `l` | Move left / right |
| `w` / `b` | Next / previous word |
| `gg` / `G` | Go to top / bottom |
| `Ctrl+d` / `Ctrl+u` | Page down / up |
| `]c` / `[c` | Next / previous hunk |
| `]f` / `[f` | Next / previous file |

### Views & Actions

| Key | Action |
|-----|--------|
| `Tab` | Toggle diff / comments view |
| `Ctrl+b` | Toggle file tree panel |
| `Ctrl+f` | Find files (fuzzy search) |
| `Ctrl+g` | Select commit to view |
| `Ctrl+p` | Open action menu |
| `c` | Add comment on current line |
| `v` | Mark file as viewed |
| `/` | Search in diff |
| `g?` | Show help overlay |
| `q` | Quit |

### Folds

| Key | Action |
|-----|--------|
| `za` | Toggle file/hunk fold |
| `zo` / `zc` | Open / close fold |
| `zR` / `zM` | Expand / collapse all |

## Configuration

Config file: `~/.config/riff/config.toml`

```toml
# Map remote repos to local clones
[storage.repos]
"facebook/react" = "~/code/react"

# Auto-detect repos under a base path
[storage]
basePath = "~/code"

# Hide files from review (still accessible via toggle)
[ignore]
patterns = ["package-lock.json", "*.generated.*"]
```

## Requirements

- [Bun](https://bun.sh) runtime
- [`gh` CLI](https://cli.github.com/) for GitHub features
- `git` or `jj` for local diff features

## Development

```bash
just dev       # Run with hot reload
just test      # Run tests
just typecheck # Type check
just build     # Build standalone binary
```

## License

MIT
