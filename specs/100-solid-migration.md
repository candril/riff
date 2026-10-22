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

M5 is complete: every caller imports the module it needs, and none of
the split directories has a barrel.

`src/providers/github/` holds twelve modules: the GitHub data types
(`types.ts`), running `gh` and making its failures readable (`exec.ts`),
diff fetching (`diff.ts`), file content fetching (`content.ts`), review
threads and their resolution (`threads.ts`), reactions (`reactions.ts`),
viewed-file sync (`viewed.ts`), the PR session bundle with session loading
(`session.ts`), comment and PR mutations (`mutations.ts`), the pending
review and batch review submission (`review.ts`), the PR lookups for
check annotations, stacks, the timeline and references (`lookups.ts`) and
the mentionable users (`mentions.ts`).

`src/storage/` holds five modules: where a review's storage lives and the
cache of what startup resolved (`resolve.ts`), the comment file format,
pure and without I/O (`comments-md.ts`), the comment store
(`comments.ts`), the checkout's session (`session.ts`) and the small
per-review JSON files for viewed files, the visit watermark, marks and
panel filters, with the mentionable-user cache (`caches.ts`).

`src/utils/editor/` holds the comment template: the comment, draft and
PR conversation buffers and their parsers (`comment-template.ts`, with
the diff rows around the anchor in `diff-context.ts`); the PR template
for editing and creating a PR (`pr-template.ts`); editor spawning
(`spawn.ts`); the tmux hand-off (`tmux.ts`); and the external diff viewer
(`diff-viewer.ts`). The templates are pure, so their round trips are
tested without spawning anything.

The `@opentui/keymap` keymap is wired and offered every key, and what its
layers leave goes to the file tree's leftover
([ADR-002](../docs/decisions/ADR-002-keys-through-the-keymap.md)); it
holds F12, the debug console, the flash jump's keys, the confirmation
dialog's, the command palette's, those of the file, comments, marks,
occurrence and commit pickers, those of the sync preview and Submit
Review, the help overlay's, the chat's, the thread panel's in view mode
and in its composer with the mention and emoji pickers, the PR overview's,
the activity feed's, the search and tree filter prompts', the blame and
line peeks', the pending text object's, the global keys and the file
tree's. A modal layer captures the keys it does not bind, so none of them
reaches the chain while it is up; the palette's, the pickers' and Submit
Review's captures leave them unprevented for their prompt fields and the
summary to type, and the commit picker's does so only in its `/` mode.
Every modal layer stands aside under any modal that outranks it, even for
keys that modal leaves unbound. The help overlay's capture leaves a bare
`g` to the keymap's `g` sequences, so `g?` closes it, and the overlay
stands aside entirely while a chord is pending. The chat's capture
leaves the keys it does not bind unprevented for its input to type, and
the chat registers behind the help overlay, the previews, the pickers
and the modals, and ahead of every other layer, F12's app layer among
them, with which it shares no key, as its branch sat first in the chain,
so Ctrl-r and the step in from the thread panel stand aside under every
modal. The composer's capture leaves the keys it does not bind
unprevented for its textarea to type; it registers behind the chat,
whose branch the chain asked before the thread panel's, and the chat
stands aside while it is open. The thread panel's view mode registers
behind the composer, as the two are never active together; its capture
leaves Ctrl-p, Ctrl-f and a bare `s` to the chain outside its filter
prompt and code peek, for the palette, the file picker and flash, and
Ctrl-r, and Ctrl-l while the chat is open, wherever the chat takes them,
as the chat's branch came first. Its `za` and `g` chords stay its own
rather than keymap sequences. The PR overview registers behind the thread
panel, whose branch the chain asked first; its capture holds every key
while its filter or comment prompt is up, none while the tree has focus,
and otherwise leaves the chain every ctrl key, `q`, `Esc`, `Tab`, `i`, `a`
and `s`, and any `d` off a file row whatever its modifiers; while a `z` or
`g` chord of its own is pending it holds `q`, `Esc`, `Tab`, `i`, `a`, `s`
and `d` too, but no ctrl key. Its `z` and `g` chords stay its own too.
The activity feed registers behind the PR overview, as the two are
different views; its capture holds only the keys the feed acts on and
leaves every other key to the chain, every ctrl and meta key among them
and any key while a chord is pending, and while its filter prompt
is up it holds every key. Its `za` is the `z` layer's. The search prompt
and the tree's filter prompt register behind the feed
(`src/app/prompt-keys.ts`), and the blame peek and the line peek behind
them (`src/app/peek-keys.ts`), each group in the reverse of the order the
chain asked it. Each holds every key while it is up. The prompts prevent
only Esc and Enter, and in the tree filter a backspace on an empty query,
and leave every other key unprevented for their fields to type; the peeks
prevent nothing, as the chain never did. The peeks leave the chain a bare
`g`, so `go`, `gb` and `gl` complete, every key while a chord is
pending, and Ctrl-r, and Ctrl-l from the thread panel, wherever the chat
takes them. A text object pending in the diff is a keymap capture
registered behind the peeks (`src/app/text-object-keys.ts`): it hands
every key but the chat's reach to the vim handler and prevents nothing,
and the peeks stand aside for it. The global keys, which work in any mode,
are one layer registered behind every layer but the tree's
(`src/app/global-layer-keys.ts`), as the chain asked them after its modal
branches and before its sequences, the tree and the diff; it is no
capture, and stands aside while any capture holds the key. Each command
declines a key its case in the chain let through, leaving it unprevented
for the layers behind, and declines every key while a chord is pending. Its
bindings take any modifiers, and the keymap's folding of names to lower
case lets the binding on `g` take the tree's `G`. The file tree's keys are
one layer registered behind the global keys
(`src/features/file-tree/keys.ts`), so a key the global keys decline falls
through to it; it stands aside while a chord is pending, and a key
that breaks off a chord without completing a sequence still reaches the
tree through its leftover, as does a slash kitty names after its base key
on a layout where `/` is shifted. The `]`/`[` motions, the `z` chords
and the `g` chords are three layers of keymap sequences registered behind
the tree's (`src/app/bracket-keys.ts`, `src/app/z-chord-keys.ts`,
`src/app/g-chord-keys.ts`), as the chain asked its sequences after the
global keys and before the tree; their openers differ, so none outranks
another. The brackets' first stroke takes any modifiers; the `z` and `g`
openers are sequence patterns taking a key named `z` or `g` without
shift, whatever else is held, as the chain opened on them, since a
binding on `z` would also take a key named `Z`.
Each second stroke is a sequence pattern that matches on the suffix the
chain spelled (`src/app/chord-stroke.ts`), so ctrl and meta are ignored
and shift is not, and a capital is told from its lower-case letter, so
both spellings of a shifted chord stay, `]R` and `[R` taking both as
the `z` chords do; a key the chat reaches completes
no sequence; it breaks off the pending one and acts at the re-offer, so
Ctrl-r after `]` opens the chat rather than reading as `]r`.
The patterns are registered once for every layer. Each layer stands
aside while any capture holds the key. A key that breaks off a keymap
sequence is offered to the layers again, with the chord still counting
as pending, before it reaches the leftover as the second key of a chord,
as the chain asked the chat ahead of its sequences and its global keys
declined under a chord. A `]`, `[`, `z` or `g` that breaks off a
sequence opens its own, so `]]f`, `g]f`, `gzz` and `zgg` still act,
behind the help overlay too.
Under a peek the `g` layer swallows every second key the peek refuses, as
the chain did. A lone `]`, `[`, `z` or `g` gives up after the chain's
500 ms chord timeout (`chordTimeoutMs`), as the chain's opener did,
through one `pendingSequence` listener (`src/app/sequence-expiry.ts`).
The mark chords, `m{letter}`, `'{letter}` and `''`, are a fourth layer of
keymap sequences (`src/app/mark-chord-keys.ts`), registered behind the
other three, as the chain asked them after everything else that is now a
layer. Their openers are sequence patterns that take `m` or `'` only
while the diff has the keys in normal mode with no find or text object
waiting, never on a key that broke off another sequence, so `]'` opens
none. The second key is a letter, whose case comes from its spelling and
whose ctrl and meta are ignored, a `'` after `'`, or any other key, which
the chord swallows; a key the chat or F12 takes breaks off the chord and
acts at the re-offer. A mark chord waits as long as it takes, so its
openers are not among the ones that expire. A pending mark chord whose
diff has lost the keys, say to a click into the tree, gives way at the
dispatch entry, before any layer sees the key, so the key reaches the
tree as one with no chord pending. The diff's keys and the split toggle
are one layer of a catch-all sequence pattern, registered behind every
other layer (`src/features/diff-view/keys.ts`), as the chain asked the
diff last: the vim handler parses any key, so the layer binds a pattern
that matches every key rather than a list of names, and a key every
layer above declines falls through to it. Only the toggle gives way to a
chord; a key that breaks off one reaches the diff at the re-offer. Every
layer that gives way to a chord reads the keymap's pending sequence. The
priority chain is gone: the tree's leftover (`treeLeftover` in
`src/features/file-tree/keys.ts`) takes the two cases it had left, a key
that broke off a chord and a slash kitty names after its base key.

The help overlay's state is the first feature state factory
(`createHelpState` in `src/features/help/state.ts`, ADR-003): the frame
pass reads its accessors into the published frame, so the islands still
follow one frame. The confirm dialog is the second (`createConfirmState`
in `src/features/confirm/state.ts`); the frame carries only its question,
and its answers stay in the factory, where the keys read them.
The sync preview is the third (`createSyncPreviewState` in
`src/features/sync-preview/state.ts`).
Submit Review is the fourth (`createReviewPreviewState` in
`src/features/review-preview/state.ts`); the model reads the pending
review from AppState, where the PR load puts it.
The file picker is the fifth (`createFilePickerState` in
`src/features/file-picker/state.ts`); the prompt reads its query off the
factory.
The comments picker is the sixth (`createCommentsPickerState` in
`src/features/comments-picker/state.ts`); the prompt reads its query off
the factory too.
The occurrence picker is the seventh (`createOccurrencePickerState` in
`src/features/occurrence-picker/state.ts`); the prompt reads its query or,
while narrowing, its filter off the factory.
The marks picker is the eighth (`createMarksPickerState` in
`src/features/marks/picker-state.ts`); the prompt reads its query off the
factory too.
The base lookups are the ninth (`createBaseLookupsState` in
`src/features/pr-info-panel/base-lookups-state.ts`); their reads live in
`base-lookups.ts` beside it.
The commit picker is the tenth (`createCommitPickerState` in
`src/features/commit-picker/state.ts`); the prompt reads its query off the
factory too.

The command palette reads the keymap's command entries: an action names
the command that runs it, and its hint is that command's `keys` field
(`src/app/command-keys.ts`, [020](./020-action-menu.md)).
An action with no case of its own in the executor runs that command
through `runCommand`, on the keypress its hint spells.

**Not built**: the rest of M6 (the rest of the state factories); the file
size ratchet (P3).

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
- the merge status in the PR info panel ([108](./108-merge-status.md), in progress)

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
`github/{types,exec,diff,content,threads,reactions,viewed,session,mutations,review,lookups,mentions}.ts`;
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
