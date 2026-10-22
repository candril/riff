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
`src/app/frame-pass.ts` runs each pass: it draws the diff views, publishes
one `Frame` (`src/app/frame.ts`) that every other island follows, and sets
the shell's view slot. Each follower derives its island's model from the
frame (`followFrame` in `src/app/overlays.ts`, and the `*-follower.ts`
files) and pushes it in. An island keeps its model in a store and
`reconcile`s each push, so only what changed is restyled:

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

**Feature state factories.** A feature's state moves out of `AppState`
into a factory of its own, `createXState()`, built on Solid signals as in
tenor ([ADR-003](docs/decisions/ADR-003-feature-state-factories.md)):
`src/features/help/state.ts`, `src/features/confirm/state.ts`,
`src/features/sync-preview/state.ts`,
`src/features/review-preview/state.ts` and
`src/features/file-picker/state.ts` are the examples. The frame pass reads
each factory's accessors into the `Frame`, so islands keep following one
frame; its actions do not render, so callers still call `render()` after
them, and a reload that rebuilds `AppState` resets the factory itself.

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

Keyboard input arrives through one `renderer.keyInput.on("keypress")`
listener, inside the jump recorder. Each key goes first to the
`@opentui/keymap` keymap's layers (`src/app/keymap.ts`), all registered
from `src/app/keys.ts`; the `]`/`[`, `z`, `g` and mark chords are keymap
sequences among them, and the diff's keys and the split toggle are the
layer behind every other. A key no layer takes goes to the tree's
leftover in `src/features/file-tree/keys.ts`, which hands the tree a key
that broke off a chord or a slash kitty names after its base key where
`/` is shifted ([ADR-002](docs/decisions/ADR-002-keys-through-the-keymap.md)).

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
│   ├── visit.json             # when you last looked, and what you had read
│   └── info-panel.json        # the info panel sections the reader opened
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
│   ├── frame-pass.ts     # Each pass: draws the diff, publishes the frame islands follow
│   ├── keymap.ts         # The keymap riff feeds every key first (ADR-002)
│   ├── keys.ts           # Builds the keymap with every layer, the tree's leftover behind them
│   ├── app-keys.ts       # The keymap's app layer: F12, which no pending chord swallows
│   ├── confirm-keys.ts   # The confirmation dialog's layer, which captures every key
│   ├── key-context.ts    # The context every keymap layer's deps are built from
│   ├── bracket-keys.ts   # The ]/[ motions as keymap sequences, beside the z and g layers
│   ├── bracket-key-deps.ts  # What those motions need of the app
│   ├── bracket-commands.ts  # One command per ]/[ motion, and adjacentCommit
│   ├── z-chord-keys.ts   # The z chords as keymap sequences, beside the bracket layer
│   ├── z-chord-commands.ts  # One command per z chord
│   ├── z-chord-key-deps.ts  # What the z chords need of the app
│   ├── g-chord-keys.ts   # The g chords as keymap sequences, beside the bracket and z layers
│   ├── g-chord-commands.ts  # One command per g chord
│   ├── g-chord-key-deps.ts  # What the g chords need of the app
│   ├── follow-link-deps.ts  # Where gf, gF, gx and gX take the link under the cursor
│   ├── chord-stroke.ts   # A chord's second key as a suffix, and its sequence patterns
│   ├── sequence-expiry.ts  # The chord timeout a lone ], [, z or g gives up after
│   ├── mark-chord-keys.ts  # The mark chords as keymap sequences, behind the other sequence layers
│   ├── mark-chord-key-deps.ts  # What the mark chords need of the app
│   ├── mark-chord-gate.ts  # Whether the diff reads m, ' and ]m as mark keys
│   ├── diff-key-deps.ts  # What the diff layer, the lowest, needs of the app
│   └── init.ts           # Loading a session into state
├── state.ts              # App state and its pure updaters
├── types.ts              # Type definitions
├── theme.ts              # Catppuccin tokens; the three shades (spec 106)
├── version.ts            # The version the build stamps
├── storage/              # .riff/ persistence
│   ├── resolve.ts        # where a review's storage lives: repo root, jj workspace, mapped checkout, ~/.riff
│   ├── comments-md.ts    # the comment file format: frontmatter and body, no I/O
│   ├── comments.ts       # the comment store: one Markdown file per comment
│   ├── session.ts        # the checkout's session.json
│   ├── caches.ts         # per-review viewed, visit, marks and panel filters; the mentionable-user cache
│   └── info-sections.ts  # per-review open sections of the PR info panel
├── actions/
│   ├── registry.ts       # Ctrl-p palette actions (add new actions here!)
│   └── types.ts          # Action types
├── cli/                  # args, `riff comments`, the Claude skill
├── config/               # schema, defaults, loader for config.toml
├── providers/
│   ├── local.ts          # git/jj diffs
│   ├── files.ts          # file mode (`riff <path>`)
│   ├── github/
│   │   ├── types.ts      # PR data shapes: PrInfo, PrCheck, PrComment…
│   │   ├── exec.ts       # running gh, turning its failures into readable errors
│   │   ├── diff.ts       # PR and commit diffs, past GitHub's file cap via the files API
│   │   ├── content.ts    # file content at a PR's head, base or any revision
│   │   ├── threads.ts    # review threads and their comments, resolving and unresolving them
│   │   ├── reactions.ts  # reading reactions off the API, adding and removing them
│   │   ├── session.ts    # the PR bundle (one GraphQL query) and loading a PR's review session
│   │   ├── viewed.ts     # GitHub's viewed state per file, read and marked
│   │   ├── mutations.ts  # posting, editing and deleting comments; editing and creating the PR
│   │   ├── review.ts     # the pending review and submitting comments as one review
│   │   ├── lookups.ts    # check annotations, the PR stack, the timeline, reference titles
│   │   └── mentions.ts   # who can be @mentioned in the repo
│   ├── demo.ts           # --demo fixture
│   ├── blame/            # who last changed a line, from jj, git or GitHub (spec 103)
│   └── agent/            # riff's agent: SDK session, prompt, read tools (spec 102)
├── features/             # one directory per feature: index.ts, plus keys.ts / input.ts / handlers.ts
│   ├── marks/            # global marks (spec 101)
│   └── chat/             # the chat column's state, keys and components (spec 102)
├── vim-diff/             # line mapping, cursor, motions, search, flash, word diff
├── diff-rows/            # rows, pairing, segments, wrap and colours both diff views draw
├── split-view/           # the diff views, split and unified, as Solid components
├── components/           # a pure model per view (*-model.ts) and its component (*.tsx)
├── testing/              # frame and app harnesses for tests
└── utils/                # parsing, markdown, links, fuzzy matching
    └── editor/
        ├── comment-template.ts  # the comment, draft and PR conversation buffers and their parsers
        ├── diff-context.ts      # the diff rows around a comment's anchor
        ├── pr-template.ts       # the PR edit and create buffers and their parsers
        ├── spawn.ts             # $EDITOR on a temp file; the PR, comment and draft editors
        ├── tmux.ts              # handing a file or command to a tmux window or pane
        └── diff-viewer.ts       # the configured and external diff viewers
```

`PRInfoPanel.ts` in `src/components` is not a model-and-component pair:
it is the PR overview's controller rather than a view. It holds the
cursor, the open sections and the scroll, and pushes the sections
`panelSections` builds into one island (`src/app/pr-info-panel.tsx`).

A field that is typed into is its island's own, mounted once and only
ever hidden, so it keeps its cursor while the island redraws. A one-line
prompt's field (`src/app/island-prompt.tsx`) is handed its typing
session through the island's `prompt()`, which
`src/app/prompt-routing.ts` calls from the render pass. The comment
composer's textarea is the thread panel island's own
(`src/app/island-composer.tsx`), handed its session through
`compose()`.

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

Current measured costs: PR bundle 54, full thread fetch 51, probe-depth
thread fetch 2, `getPrThreadStates` 1, `fetchPrMetaReactions` 2,
`fetchViewedStatuses` 1. The bundle carries the merge status's required
checks, mergeability and required approvals (spec 108) at no extra cost.
Note that `gh pr view --json …` is GraphQL, not REST. The activity feed's
timeline (spec 070) is REST and paginated, and only fetched when the feed is
opened or refreshed; the stacked-PR check (spec 072) and the merge status's
behind count (spec 108) run on load and refresh, never on a comment poll.

## Actions

Actions are commands that can be triggered via the action menu (`Ctrl+p`) or keyboard shortcuts.

### Adding a New Action

1. Add the action definition to `src/actions/registry.ts`:

```typescript
{
  id: "my-action",
  label: "My Action",
  description: "What this action does",
  command: "gchord.myAction",  // The keymap command that runs it; the palette shows its `keys`
  category: "navigation" | "github" | "view" | "general" | "external",
  available: (state) => true,  // When action is available
},
```

2. Add the handler in `src/features/action-menu/execute.ts` or the relevant feature module.
   An action with no case there runs its command on the key its hint spells.

3. If adding a keyboard shortcut, bind it in a keymap layer
   ([ADR-002](docs/decisions/ADR-002-keys-through-the-keymap.md)) and give
   its command `keys`, the spelling the palette shows. A key no command runs
   the action for (the diff's vim keys) goes in the action's own `shortcut`
   instead ([spec 020](specs/020-action-menu.md))

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
| Blame | gb | Who last changed the cursor's line; from its peek, go opens the commit or PR and y copies the sha |
| PR Info | gi | Show PR details |
| PR state / feed / diff | i / a / d | The three views; the same key again goes back |
| Filter | Ctrl+f | Narrow whatever has focus |
| Toggle File Panel | Ctrl+b | Show/hide file tree |
| Expand File Panel | Ctrl+e | Toggle file panel full width |
| Help | g? | Show keyboard shortcuts |
| Clear Local Comments | — | Delete every local (unpublished) comment for this review |
| Quit | q | Exit riff |
