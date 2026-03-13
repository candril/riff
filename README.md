# riff

A terminal-based code review companion built with [OpenTUI](https://github.com/neurocyte/opentui). Review GitHub PRs and local changes with minimal distractions.

![riff screenshot](https://github.com/user-attachments/assets/placeholder.png)

## Features

- **GitHub PR Review** - Fetch and review pull requests directly in your terminal
- **Local Diff View** - Review uncommitted changes or compare branches locally
- **Vim-style Navigation** - Navigate diffs with familiar vim keybindings (hjkl, w/W/e/E/b/B, /, n/N, etc.)
- **Inline Comments** - Add comments to specific lines, synced with GitHub
- **File Tree Panel** - Browse changed files with fold/unfold support
- **Syntax Highlighting** - Full syntax highlighting powered by Tree-sitter
- **Omni Search** - Fuzzy search across files, comments, and actions

## Installation

```bash
# Clone the repository
git clone https://github.com/candril/riff.git
cd riff

# Install dependencies
bun install

# Run
bun run src/index.ts
```

## Usage

```bash
# Review a GitHub PR
riff gh <owner>/<repo>#<pr-number>
riff gh https://github.com/owner/repo/pull/123

# Review local changes (uncommitted)
riff local

# Review changes between branches
riff local --base main

# Show help
riff --help
```

## Keybindings

### Navigation
| Key | Action |
|-----|--------|
| `j` / `k` | Move cursor down / up |
| `h` / `l` | Move cursor left / right |
| `w` / `b` | Next / previous word |
| `gg` / `G` | Go to top / bottom |
| `Ctrl+d` / `Ctrl+u` | Page down / up |

### File Navigation
| Key | Action |
|-----|--------|
| `]f` / `[f` | Next / previous file |
| `]c` / `[c` | Next / previous change (hunk) |
| `Tab` | Toggle file tree panel |
| `Enter` | Open file / expand fold |

### Actions
| Key | Action |
|-----|--------|
| `c` | Add comment on current line |
| `v` | Toggle visual line selection |
| `m` | Mark file as viewed |
| `/` | Search in diff |
| `Ctrl+p` | Open omni search |
| `Ctrl+a` | Open action menu |
| `q` | Quit |

## Development

```bash
# Run with hot reload
just dev

# Run tests
just test

# Type check
just typecheck

# Build
just build
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **UI Framework**: [OpenTUI](https://github.com/neurocyte/opentui)
- **Language**: TypeScript
- **GitHub Integration**: `gh` CLI

## License

MIT
