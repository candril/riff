# riff

A terminal-based code review companion built with OpenTUI. Review GitHub PRs and local changes with minimal distractions.

## Specs

Feature specifications live in `specs/`. Before implementing a feature:

1. Read the relevant spec in `specs/NNN-feature-name.md`
2. Follow the capabilities priority (P1 first, then P2, then P3)
3. Use the file structure and technical notes as guidance

Architecture decisions are recorded in `docs/decisions/` as numbered ADRs.

### Spec Status

The `**Status**:` line in each spec is the only record of its state;
`specs/README.md` defines the values. `just specs` lists them all, `just specs
Partial` one kind. Set `Done` in the same change that completes the spec, and
list what was left out in its `**Not built**:` line.

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

### UI: OpenTUI and Solid

The UI is [OpenTUI](https://github.com/sst/opentui) driven by
`@opentui/solid`, mounted piece by piece into a layout riff owns
([spec 100](specs/100-solid-migration.md)). `@opentui/core`,
`@opentui/solid` and `@opentui/keymap` are pinned exact at 0.6.0 and
`solid-js` at 1.9.12: upstream breaks APIs in patch releases.

**Islands.** `src/app/shell.tsx` mounts the layout once at startup. Each
view is a Solid island: `mountSolid` in `src/app/solid-island.tsx` mounts a
Solid tree into a `BoxRenderable` host that riff places in that layout.
`src/app/render.ts` is the coordinator: on every pass it builds each
island's model from `AppState` and pushes it in, and flips which hosts are
visible. An island keeps its model in a store and `reconcile`s each push,
so only what changed is restyled:

```tsx
// src/app/notifications.tsx
export function createToastIsland(renderer: CliRenderer) {
  const [state, setState] = createStore<{ model: ToastModel | null }>({ model: null })
  const island = mountSolid(
    renderer,
    () => <Show when={state.model}>{(model: () => ToastModel) => <Toast model={model()} />}</Show>,
    { id: "toast-container", position: "absolute", top: 1, right: 2, zIndex: 100 }
  )
  return {
    host: island.host,
    update: (next: ToastModel | null) => setState("model", reconcile(next)),
    dispose: island.dispose,
  }
}
```

**A model and a component per view.** What a view shows is a pure function
of state in `src/components/*-model.ts` (`toastModel`, `threadPanelModel`,
`fileTreeModel`…); the component beside it (`Toast.tsx`,
`ThreadPanelView.tsx`…) only draws the model. The model is unit-tested; the
component is frame-tested.

**Frame tests** render a component or an island on a test screen and
assert the characters drawn: `testRender` from `@opentui/solid` or
`createTestRenderer` from `@opentui/core/testing`, then `captureCharFrame()`.
`src/testing/frame.ts` wraps both (`mountJsx`, `mountRenderable`,
`trimFrame`, and `bgAt` / `fgAt` for shades); `src/testing/app-render.ts`
mounts the whole app for keys tests.

**Wiring.** `bunfig.toml` preloads `@opentui/solid/preload` for `bun run`
and `bun test`, and `tsconfig.json` sets `"jsx": "preserve"` with
`"jsxImportSource": "@opentui/solid"`. `scripts/build.ts` passes
`solidPlugin` from `@opentui/solid/bun-plugin` and OpenTUI's tree-sitter
`parser.worker.js` as a second entrypoint; without the worker every
highlight fails silently in the compiled binary.

**Borderless.** Surfaces separate by background shade, never by a border
([spec 106](specs/106-borderless-ui.md)): `base` for content (the diff, the
PR description), `mantle` for everything around it (tree, thread panel,
chat, header, status bar, pickers, modals, toasts), `surface0` for inputs
and the selected row of a list, all from `src/theme.ts`. Focus shows by
shade or a coloured title, padding of one cell replaces a border's inset,
and there is no fourth level.

Keyboard input still arrives through `renderer.keyInput.on("keypress")`
and is dispatched by `src/app/global-keys.ts` to each feature's
`input.ts`.

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

Review data lives in `.riff/` at the repo root (`~/.riff/` outside a repo).
There is no repo-local config file — configuration is only
`~/.config/riff/config.toml`.

```
.riff/
├── comments/
│   └── gh-owner-repo-123/     # one markdown file per comment, YAML frontmatter
│       └── <uuid>.md
├── gh-owner-repo-123/
│   ├── viewed.json            # viewed state + the commit it was viewed at
│   └── visit.json             # when you last looked, and what you had read
├── mentionable-users.json     # cached @mention roster (24h TTL)
└── session.json               # current review session
```

The directory name is the source with its punctuation flattened:
`gh:owner/repo#123` → `gh-owner-repo-123`.

`riff comments [list|resolve|unresolve|remove|clear|install-skill]` operates
on those files from the command line (`src/cli/comments.ts`, spec 049), and
`install-skill` writes the Claude Code skill in `src/cli/skill.ts` that
drives it. The same skill ships as a plugin (`plugins/riff/`, with the repo
as its marketplace via `.claude-plugin/marketplace.json`); `just sync-skill`
regenerates the plugin copy and a test fails if the two drift. A thread resolved while still local is never published —
`isLocallyResolved` in `src/utils/publishable.ts` is the single rule, used by
every path that sends comments to GitHub.

## File Structure

```
src/
├── index.ts              # Entry point, CLI parsing
├── app.ts                # Renderer setup, keypress loop
├── app/
│   ├── shell.tsx         # The layout, mounted once
│   ├── solid-island.tsx  # mountSolid: a Solid tree in a host riff owns
│   ├── *.tsx             # One island per view (header, file-tree, thread-panel, chat-column, pickers…)
│   ├── unified-*, split-*  # The diff views' islands, cursor, columns and the split toggle
│   ├── render.ts         # The coordinator: builds each island's model and pushes it in
│   ├── global-keys.ts    # Every key binding outside a focused feature
│   └── init.ts           # Loading a session into state
├── state.ts              # App state and its pure updaters
├── types.ts              # Type definitions
├── theme.ts              # Catppuccin tokens; the three shades (spec 106)
├── version.ts            # The version the build stamps
├── storage.ts            # .riff/ persistence
├── actions/
│   ├── registry.ts       # Ctrl-p palette actions (add new actions here!)
│   └── types.ts          # Action types
├── cli/                  # args, `riff comments`, the Claude skill
├── config/               # schema, defaults, loader for config.toml
├── providers/
│   ├── local.ts          # git/jj diffs
│   ├── files.ts          # file mode (`riff <path>`)
│   ├── github.ts         # GitHub via gh (GraphQL and REST)
│   ├── demo.ts           # --demo fixture
│   └── agent/            # riff's agent: SDK session, prompt, read tools (spec 102)
├── features/             # one directory per feature: index.ts, plus input.ts / handlers.ts
│   ├── marks/            # global marks (spec 101)
│   └── chat/             # the chat column's state, keys and components (spec 102)
├── vim-diff/             # line mapping, cursor, motions, search, flash, word diff
├── diff-rows/            # rows, pairing, segments, wrap and colours both diff views draw
├── split-view/           # the diff views, split and unified, as Solid components
├── components/           # a pure model per view (*-model.ts) and its component (*.tsx)
├── testing/              # frame and app harnesses for tests
└── utils/                # parsing, markdown, links, fuzzy matching, editor hand-off
```

Two kinds of file in `src/components` are not model-and-component pairs.
`PRInfoPanel.ts` is the one view still built imperatively: it holds the PR
overview's cursor, scroll and section boxes, and mounts an island per
section. `PromptInput.ts` and `CommentComposer.ts` keep OpenTUI's native
input and textarea alive across passes, so a field keeps its cursor while
the islands that host it redraw.

## Configuration

`~/.config/riff/config.toml`, merged over `src/config/defaults.ts`.

```toml
[poll]
interval = 300   # Seconds between background comment checks (0 disables)
onFocus = true   # Skip ticks while the terminal is unfocused; refresh on focus-in
```

### GitHub API budget

GraphQL is metered in **points, not requests** — GitHub prices a query by its
nested node count, and the quota is 5000/hour, separate from REST's 5000.
Nesting is what costs: `reviewThreads(first:100)` x `comments(first:50)` is 51
points, while two sibling 100-node connections are 2. Anything on a timer must
be costed before it ships (`rateLimit { cost }` in the query reports it).

Current measured costs: full thread fetch 51, probe-depth thread fetch 2,
`getPrThreadStates` 1, `fetchPrMetaReactions` 2, `fetchViewedStatuses` 1.
Note that `gh pr view --json …` is GraphQL, not REST. The activity feed's
timeline (spec 070) is REST and paginated, and only fetched when the feed is
opened or refreshed; so is the stacked-PR check (spec 072), after the first
render.

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
| Show File Path | — | Display current file path as toast |
| Select Commit | Ctrl+g | Scope the diff to one commit |
| Open in Editor | gf | Open current file in $EDITOR |
| Open in Editor (tmux window) | gF | Open current file in $EDITOR in a new tmux window, riff keeps running |
| Diff File in $EDITOR | gd | Both versions side by side; gD does it in a tmux pane |
| Refresh | gr | Reload diff, commits, and comments — keeping your place |
| Submit Review | gS | Submit review (PR mode) |
| Sync Changes | gs | Sync local comments/edits/replies |
| Create/Edit PR | gP | Create PR (local) or edit PR (PR mode) |
| Open in Browser | go | Open PR in browser |
| PR Info | gi | Show PR details |
| PR state / feed / diff | i / a / d | The three views; the same key again goes back |
| Filter | Ctrl+f | Narrow whatever has focus |
| Toggle File Panel | Ctrl+b | Show/hide file tree |
| Expand File Panel | Ctrl+e | Toggle file panel full width |
| Help | g? | Show keyboard shortcuts |
| Clear Local Comments | — | Delete every local (unpublished) comment for this review |
| Quit | q | Exit riff |
