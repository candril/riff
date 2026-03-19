# riff

A terminal-based code review companion built with OpenTUI. Review GitHub PRs and local changes with minimal distractions.

## Specs

Feature specifications live in `specs/`. Before implementing a feature:

1. Read the relevant spec in `specs/NNN-feature-name.md`
2. Follow the capabilities priority (P1 first, then P2, then P3)
3. Use the file structure and technical notes as guidance

### Spec Status

- `Draft` - Still being written
- `Ready` - Ready for implementation
- `In Progress` - Currently being implemented
- `Done` - Completed (moved to `specs/done/`)

## Commands

Use `just` for common tasks:

- `just run` - Run the app
- `just dev` - Run with hot reload
- `just test` - Run tests
- `just typecheck` - Type check

## Version Control (jj)

This project uses jj (jujutsu) for version control. Follow this workflow:

### Before starting a task

1. Check if on an empty change: `jj status`
2. If current change has modifications, create a new one: `jj new -m "Description of task"`
3. If already on an empty change, set the description: `jj describe -m "Description of task"`

### While working

- Changes are automatically tracked (no staging needed)
- Check status anytime: `jj status`
- View history: `jj log`

### After completing a task

1. Verify changes look correct: `jj diff`
2. Create a new empty change for the next task: `jj new`

### Common commands

| Command | Description |
|---------|-------------|
| `jj status` | Show working copy changes |
| `jj log` | Show commit history |
| `jj diff` | Show current changes |
| `jj new -m "msg"` | Create new change with message |
| `jj describe -m "msg"` | Set/update current change message |
| `jj squash` | Squash into parent change |
| `jj git push` | Push to remote |

### Key differences from git

- No staging area - all changes are automatically included
- Changes are mutable until pushed
- Use `jj new` instead of `git commit` to finish a change
- The working copy is always a change (shown as `@` in log)

## Tech Stack

### Runtime: Bun

Use Bun instead of Node.js:

- `bun <file>` to run TypeScript files
- `bun test` for testing
- `bun install` for dependencies
- Bun automatically loads `.env` files

### UI: OpenTUI

Terminal UI built with `@opentui/core`. Key patterns:

```typescript
import { createCliRenderer, Box, Text, Diff, ScrollBox, Input } from "@opentui/core"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
})

// Components are factory functions
renderer.root.add(
  Box(
    { width: "100%", height: "100%", flexDirection: "column" },
    Text({ content: "Hello", fg: "#7aa2f7" }),
  )
)

// Keyboard handling
renderer.keyInput.on("keypress", (key) => {
  // key.name, key.ctrl, key.alt, key.shift
})
```

Key components:
- `Box` - Flexbox container
- `Text` - Text display
- `Diff` - Diff rendering with syntax highlighting
- `ScrollBox` - Scrollable container
- `Input` - Text input
- `Select` - Selection list

### GitHub: `gh` CLI

Use `gh` CLI for GitHub API access:

```typescript
import { $ } from "bun"

// Fetch PR diff
const diff = await $`gh pr diff ${prNumber}`.text()

// Get PR info
const pr = await $`gh pr view ${prNumber} --json title,body,comments`.json()

// Submit comment
await $`gh api repos/${owner}/${repo}/pulls/${pr}/comments \
  -f body=${body} -f path=${path} -f line=${line}`
```

### Local Storage

Review sessions stored in `.riff/`:

```
.riff/
├── sessions/
│   ├── local-abc123.json      # Local diff session
│   └── gh-owner-repo-123.json # GitHub PR session
└── config.toml                # (optional) local config override
```

## File Structure

```
src/
├── index.ts              # Entry point, CLI parsing
├── app.ts                # Renderer setup, main loop
├── state.ts              # App state management
├── types.ts              # Type definitions
├── actions/
│   ├── registry.ts       # Action definitions (add new actions here!)
│   └── types.ts          # Action types
├── config/
│   ├── schema.ts         # Config types
│   ├── defaults.ts       # Default configuration
│   └── loader.ts         # Load and merge config
├── providers/
│   ├── local.ts          # Git diff commands
│   └── github.ts         # GitHub API via gh CLI
├── storage.ts            # Local session persistence
├── utils/
│   ├── keymap.ts         # Key sequence handling
│   ├── diff-parser.ts    # Parse diff into files
│   └── fuzzy.ts          # Fuzzy matching
├── omni/
│   ├── index.ts          # Omni search coordinator
│   └── sources/          # Search sources
└── components/
    ├── Shell.ts          # Root layout
    ├── Header.ts         # Title bar
    ├── StatusBar.ts      # Bottom hints
    ├── DiffView.ts       # Diff display
    ├── FileList.ts       # File panel
    ├── CommentInput.ts   # Comment editor
    └── OmniSearch.ts     # Fuzzy finder
```

## Actions

Actions are commands that can be triggered via the action menu (`Ctrl+p`) or keyboard shortcuts.

### Adding a New Action

1. Add the action definition to `src/actions/registry.ts`:

```typescript
{
  id: "my-action",
  label: "My Action",
  description: "What this action does",
  shortcut: "ga",  // Optional keyboard shortcut
  category: "navigation" | "github" | "view" | "general" | "external",
  available: (state) => true,  // When action is available
},
```

2. Add the handler in `src/features/action-menu/execute.ts` or the relevant feature module

3. If adding a keyboard shortcut, wire it up in `src/app/global-keys.ts`

### Current Actions

| Action | Shortcut | Description |
|--------|----------|-------------|
| Find Files | Ctrl+f | Jump to a file in the diff |
| Show File Path | Ctrl+g | Display current file path as toast |
| Open in Editor | gf | Open current file in $EDITOR |
| Refresh | gr | Reload diff, commits, and comments |
| Submit Review | gS | Submit review (PR mode) |
| Sync Changes | gs | Sync local comments/edits/replies |
| Create/Edit PR | gP | Create PR (local) or edit PR (PR mode) |
| Open in Browser | go | Open PR in browser |
| PR Info | gi | Show PR details |
| Toggle File Panel | Ctrl+b | Show/hide file tree |
| Expand File Panel | Ctrl+e | Toggle file panel full width |
| Help | g? | Show keyboard shortcuts |
| Quit | q | Exit riff |
