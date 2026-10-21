# Solid Migration

**Status**: In Progress

## Description

riff's UI moves from the imperative `@opentui/core` factory API to
`@opentui/solid`, the way [tenor](../../tenor) is built, and the first
thing the move delivers is a split diff view.

Today a state change reaches the screen by hand. `app.ts` keeps `AppState`
in a closure, about 430 `setState` calls are each followed by a `render()`,
and the render pass destroys and rebuilds every piece of chrome on every
call while three long-lived classes (`VimDiffView`, `FileTreePanel`,
`PRInfoPanel`) diff their own inputs by reference. Each of those files has
grown past 3k lines because nothing in the shape stops it.

The split view is the reason to start with the diff. `VimDiffView` draws
one content column — a `LineNumberRenderable` wrapping one
`CodeRenderable` per file section — and every coordinate in it resolves
against that single origin ([032](./032-diff-strategies.md), "What split
view would cost"). tenor draws a diff as one-cell-high rows, windowed by
slicing the row list, with each half of a pair row its own box. In that
model two panes are the layout and nothing more, and a column window per
pane is a slice of the text.

The migration is a strangler, not a rewrite. Every step leaves riff
shippable: it typechecks, its tests pass, the binary builds and runs.
[016](./016-react-reconciler-migration.md) moved the whole tree aside and
delivered nothing until everything was ported; this spec orders the work
so the payoff comes first and a stall at any point leaves a better riff
behind.

## Progress

M0 to M4 are done: OpenTUI and Solid are pinned and wired, split view and
unified both draw from the row model in `src/split-view`, and
`VimDiffView` is gone. Every piece of chrome is a Solid island: header,
status bar, prompts, toasts, confirm dialog, pickers, peeks, the palette,
the help overlay, the sync preview, Submit Review and the activity feed.
So are the file tree, the thread panel and the PR info panel, each handed
a pure model; the thread panel's mention and emoji pickers are a
subcomponent (`ThreadPanelPicker.tsx`) and its window is a model of its
own (`thread-panel-window.ts`). The PR info panel is one island
(`src/app/pr-info-panel.tsx`) drawn from `panelSections`; its cursor,
open sections and filter are the `pr-info-nav` model, and
`PRInfoPanelClass` is left as the controller that holds them and pushes.

The render coordinator is deleted. `src/app/frame-pass.ts` runs each pass:
it draws both diff views (`diff-pass.ts`), marks the comments on screen as
seen (`comments-seen.ts`), publishes one `Frame` and mounts the view
`viewSlotOf` picks (`view-slot.ts`). Every other island follows the frame
and derives its own model from it, the prompts and the comment composer
too: each prompt's field and the composer's textarea are their island's
own, handed their session through `prompt()` and `compose()` by the
frame's first followers. The diff views draw ahead of publish because the
frame carries the status bar's readout of them.

M5 is in progress. `src/providers/github/` holds eight modules: the
GitHub data types (`types.ts`), running `gh` and making its failures
readable (`exec.ts`), diff fetching (`diff.ts`), file content fetching
(`content.ts`), review threads and their resolution (`threads.ts`),
reactions (`reactions.ts`), viewed-file sync (`viewed.ts`) and the PR
session bundle with session loading (`session.ts`). Only the mutations
and the PR lookups are still in `src/providers/github.ts`.

**Not built**: the rest of M5 (the mutations and the PR lookups out of
`github.ts`; `storage.ts`; `utils/editor.ts`); M6 (state factories and
`@opentui/keymap` layers); the file size ratchet (P3).

The Out of Scope line on new features gave way to the user's feedback
queue. At the user's request the migration also added:

- the borderless UI in three shades ([106](./106-borderless-ui.md))
- global marks ([101](./101-global-marks.md))
- the thread panel as a column beside the diff
  ([039](./039-inline-comment-overlay.md))
- the version in the header and the help overlay
  ([105](./105-version-in-chrome.md))
- `gB`, opening the PR in riff board ([104](./104-riff-board.md))
- page motions in the file tree and the thread panel, and the open-only
  and unviewed-only filters ([107](./107-panel-filters.md))
- the agent chat ([102](./102-agent-chat.md), in progress)
- blame, the `gb` peek and the `zB` column ([103](./103-blame.md))

## Out of Scope

- **Wrap in split view.** At half width a line and its partner wrap to
  different heights and the panes lose alignment. Split view sidescrolls
  per pane instead; unified view keeps wrap ([051](./051-long-lines.md)).
- **Changing behaviour.** Every key, motion and screen works as before
  unless a step names the change. Visible differences are bugs.
- **New features beyond the split view.** No theme system, no config
  changes, no new panels.
- **The pure layers.** `vim-diff/` logic, `providers/`, `storage`,
  `cli/`, `config/` and `utils/` change only where a step splits a
  monolith or a widget call has to become data.
- **Moving riff into tenor.** riff stays its own product.

## Capabilities

### P1 - Foundation

- **OpenTUI 0.6.0**, pinned exact together with `@opentui/solid` 0.6.0,
  `@opentui/keymap` 0.6.0 and `solid-js` 1.9.12. Upstream breaks APIs in
  patch releases (tenor ADR-001).
- **Solid inside the imperative app.** A Solid tree mounts into a
  renderable riff owns (`_render(code, root)` from `@opentui/solid`), and
  an existing class renderable can sit inside a Solid tree. Both
  directions are what let one view move at a time.
- **Build and test wiring** as tenor has it: `bunfig.toml` preloads
  `@opentui/solid/preload` for `bun run` and `bun test`; `scripts/build.ts`
  passes `solidPlugin` from `@opentui/solid/bun-plugin` and the
  tree-sitter `parser.worker.js` as a second entrypoint, without which
  highlighting silently fails in the compiled binary.
- **Frame tests** of the views as they are, taken with
  `createTestRenderer` and asserted as character frames, so each port is
  checked against what riff drew before it.

### P1 - Split view

- **Old file left, new file right**, rows paired the way tenor's
  `pairLines` pairs them: a run of removals against the run of additions
  that follows, the shorter side padded with an empty half.
- **Only at 120 columns or wider** for the diff pane; below that the view
  is unified whatever was asked for. A key toggles split and unified.
- **One cursor, in one pane at a time.** `h` and `l` cross to the other
  pane at a line edge. The mapping carries the active side, so motions,
  text objects, search, flash and visual mode read that side's content
  and work unchanged.
- **Comments anchor to the pane the cursor is in**, not to a side
  inferred from the row type. Gutter signs show on the side they belong
  to.
- **Folds, dividers, expanding context, word diff and whole-file
  highlighting** ([074](./074-expanding-context.md),
  [096](./096-word-diff.md), [080](./080-highlight-from-the-file.md))
  work in both panes, because the rows come from `DiffLineMapping`.
- **Sidescroll per pane**, each with its own column window.
- **Fast enough to not notice:** the median `j` redraw on a 10,000-line
  diff stays under 16 ms, asserted by a test.

### P1 - One diff view

- **Unified runs on the new view too**, with wrap, sticky file header and
  everything [097](./097-chrome-is-not-code.md) paints today.
- **`VimDiffView` and its post-process painters are deleted.**

### P2 - The rest of the UI

- **Chrome as components:** header, status bar, prompts, toasts, confirm
  dialog, pickers and previews leave the render pass one at a time. The
  `keepAlive` input sessions become components that stay mounted.
- **`FileTreePanel`** becomes a `<For>` over the flat tree model.
- **`PRInfoPanel`** becomes a pure model plus one component per section;
  the annotation fetch moves out of the view.
- **`InlineCommentOverlay`** becomes a windowing model plus components,
  with the mention and emoji pickers as subcomponents.
- **The render coordinator is deleted**: what is left of the pass draws
  the diff and publishes the frame.

### P2 - State and keys

- **Per-feature state factories** in tenor's shape —
  `createXState()` returning accessors and actions — replace slices of
  `AppState` one at a time. `AppState` shrinks until `app.ts` only
  composes.
- **`@opentui/keymap` layers per feature** replace the priority chain in
  `global-keys.ts`; the command palette reads the keymap's command entries
  instead of display-only `shortcut` strings.

### P3 - Guard rails

- **A file size ratchet** (`scripts/check-size.ts`): no source file grows
  past its current length, and no new file passes 300 lines.

## Technical Notes

### Order of work

Each step is one jj change with a description in the repo's usual style,
stacked on the previous one. A step is done when its gate passes:

```sh
just typecheck && just test && just build && ./dist/riff --version
```

plus, for any step that touches what is drawn, a frame test showing the
view or a pty run of the real app:

```sh
{ sleep 8; printf 'j'; sleep 0.7; printf 'q'; } | script -q out.log bun run src/index.ts --demo
```

The renderer emits only changed cells, so strip escapes and count a string
across the whole log rather than reading one frame; chords go out as one
`printf`. A run rewrites `.riff/session.json` — restore it before the step
is described.

**M0 — Foundation**

1. Upgrade `@opentui/core` to 0.6.0 exact; fix what breaks, nothing else.
2. Delete the dead components (`Shell`, `DiffView`, `CommentsList`,
   `Gutter`, `CursorIndicator`, `CommentIndicators`,
   `ReviewPreviewPanel`, `VimDiffViewFunctional`) once a search confirms
   nothing but `components/index.ts` imports them.
3. Frame tests for the unified diff view (all-files and single-file,
   folds, wrap, sidescroll, signs), header, status bar and file tree.
4. Solid wiring: dependencies, `bunfig.toml`, `tsconfig` (`"jsx":
   "preserve"`, `"jsxImportSource": "@opentui/solid"`), build plugin and
   worker entrypoint, one trivial Solid component mounted into the app —
   the status bar is the candidate — with a `testRender` test.

**M1 — Split view**

5. Pure row model: `pairLines`, a `Row` union and stable row keys over
   `DiffLineMapping`'s rows, with an anchor that survives a view toggle or
   fold. Unit tests only; nothing drawn.
6. Active side on the mapping; motions, text objects, search and flash
   read it. Tests for `h`/`l` crossing panes.
7. `buildSegments` (syntax, word diff, search, flash, cursor merged per
   cell; tabs expanded) and the per-hunk-and-side highlight cache.
8. The split view component: windowed rows, two halves, gutter signs,
   folds and dividers, per-pane sidescroll; mounted in place of
   `VimDiffView` when split is on, behind the toggle key.
9. Comments from split view anchor to the active pane; the inline
   overlay and comment creation take the side from the mapping.
10. The 10,000-line perf test.

**M2 — Unified on the new view**

11. Unified rows on the new component, wrap included.
12. Sticky header, overflow and wrap markers, selection and the terminal
    cursor as components rather than post-process painting.
13. Switch unified over, prove it against the M0 frame tests, delete
    `VimDiffView` and its painters.

**M3 — Chrome.** One step per piece the render pass rebuilds, then delete
the coordinator.

**M4 — Panels.** File tree, then PR info panel section by section, then the
inline comment overlay. Split their pure models out first, as their own
steps.

**M5 — Monoliths without UI.** `providers/github.ts` into
`github/{types,exec,diff,threads,session,content,mutations,reactions,viewed}.ts`;
`storage.ts` into `storage/{resolve,comments-md,comments,session,caches}.ts`;
`utils/editor.ts` into templates and spawning. These can run any time; they
sit here because they do not block the payoff.

**M6 — State and keys.** Feature state factories and keymap layers, one
feature per step.

### Where the work happens

The migration runs in its own jj workspace, `../agents/solid-migration`, on
a bookmark `solid-migration` that moves to each finished step. Nothing is
pushed until asked.

### Lessons tenor already paid for

- `scrollbox` lays out every child, so long lists are windowed by hand.
- Tabs make OpenTUI's cell count disagree with the terminal; expand them.
- An async highlight landing after the renderer is destroyed is a native
  error; guard with a disposed flag.
- Focus a box in a microtask after it mounts; focus an input on the next
  tick or it receives the key that opened it.
- In `@opentui/keymap` a shifted letter inside a sequence is written
  `"zshift+m"`; `"zM"` never matches.
- A keymap layer registered before its target box exists follows nothing;
  mount the key hook inside the component that owns the box.
