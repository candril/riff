## Jumplist — Nvim-style `Ctrl-o` / `Ctrl-i` Navigation History

**Status**: Ready

## Description

Add an in-memory jumplist that records "big" navigation events so the user can
retrace their steps with `Ctrl-o` (back) and `Ctrl-i` (forward), matching the
muscle memory from Vim/Neovim. Small motions (line steps, scroll, hunk hops)
do not produce jumps.

## Out of Scope

- Persisting the jumplist across sessions (nvim's shada-equivalent).
- A visible `:jumps`-style list UI.
- Per-window/per-split jumplists (riff has a single primary view).
- Changelist (`g;` / `g,`) — separate concept.

## Capabilities

### P1 — MVP

- `Ctrl-o` jumps to the previous entry in the jumplist; `Ctrl-i` jumps forward.
- The following actions push a jump entry:
  - File picker selection (`Ctrl-f`)
  - File tree `Enter`
  - `]f` / `[f`, `]u` / `[u`, `]o` / `[o` file-level navigation
  - `]g` / `[g` commit switch
  - `gg` / `G`
  - Search match jump (`/`, `n`, `N`)
  - PR-info-panel "jump to file" and "jump to file:line"
  - Thread preview → open-in-diff
  - `]r` / `[r` and `]R` / `[R` thread motion (spec 039 — note these
    *also* open the inline comment overlay at the destination)
  - Cross-thread navigation while the inline comment overlay is open
    (`Ctrl-n` / `Ctrl-p` in spec 039 — closes current overlay and opens
    the next/previous thread). Within-thread `j` / `k` (highlight move
    between comments of the same thread) does **not** push.
- Applying a jump restores: file selection, viewing commit, view mode, and
  vim cursor line.
- Jumplist is capped at 100 entries; oldest entries evicted FIFO.
- Pushing after having moved back truncates any forward history (standard
  jumplist semantics).
- `Ctrl-i` is rebound from the current `Tab` view-toggle. View toggle moves to
  a new chord (proposed: `gv`) so nvim users get the expected `Ctrl-i` behavior.
  Because `Tab` and `Ctrl-i` are indistinguishable in terminal input, both keys
  invoke forward-jump.

### P2

- Status-bar hint shows position in jumplist when at non-tip (`[3/12]`).
- `Ctrl-o` / `Ctrl-i` swallow the keypress silently (no toast) when at list
  ends.

### P3

- Configurable cap via config (`jumplist.max`).
- Persist jumplist inside the session JSON under `.riff/`.

## Technical Notes

### Jump entry shape

```ts
// src/features/jumplist/types.ts
export interface Jump {
  fileIndex: number | null       // null = all-files view
  viewingCommit: string | null
  viewMode: ViewMode
  cursorLine: number              // vim cursor line at time of jump
  anchor?: {                      // for re-resolving after rebuild/refresh
    filename: string
    line: number
    side: "LEFT" | "RIGHT"
  }
}

export interface JumpListState {
  entries: Jump[]
  index: number                   // -1 when empty; otherwise points at "current"
}
```

`anchor` is captured via the existing `DiffLineMapping.getCommentAnchor`-style
lookup so that a back-jump survives commit switches and refreshes that
invalidate raw line numbers.

### State integration

Add to `AppState` in `src/state.ts`:

```ts
jumpList: JumpListState
```

Initialize as `{ entries: [], index: -1 }`.

### Feature module

New `src/features/jumplist/` with:

- `capture(state, vim, lineMapping): Jump` — snapshot current location.
- `push(state, jump): AppState` — append, evict past cap, truncate forward
  history, advance index.
- `back(state): { state, jump } | null`
- `forward(state): { state, jump } | null`
- `apply(jump, ctx)` — calls existing helpers:
  - `fileNavigation.handleSelectFile` for file changes
  - `ctx.onCommitSelected` for commit changes
  - `ctx.setVimState` + `ctx.ensureCursorVisible` for cursor
  - sets `viewMode` via existing `setState` path.

### Instrumentation

Wrap each navigation site. Pattern:

```ts
// before the navigation mutates state
ctx.setState(s => jumplist.push(s, jumplist.capture(s, vim, lineMapping)))
// ... existing navigation ...
```

Call sites (by file):

- `src/features/file-picker/*` — on selection
- `src/features/file-tree/*` — on Enter
- `src/features/file-navigation.ts` — `navigateFileSelection`,
  `navigateToUnviewedFile`, `navigateToOutdatedFile`, `handleSelectFile`
- `src/app/global-keys.ts` — `]g` / `[g` commit switch; `gg` / `G`
- `src/features/search/*` — on match jump and `n` / `N`
- `src/features/pr-info-panel/*` — `onJumpToFile` / `onJumpToLocation`
- `src/features/thread-preview/*` — when opening thread from diff
- `src/features/thread-motion/*` (spec 039) — `]r`/`[r`/`]R`/`[R`
- `src/features/inline-comment-overlay/*` (spec 039) — `Ctrl-n` / `Ctrl-p`
  cross-thread step

A shared helper `recordJumpBefore(ctx)` in `jumplist/index.ts` avoids
duplicating the capture-then-push dance.

### Key wiring

In `src/app/global-keys.ts`, register in the global-keys switch (around
line 332):

```ts
case "o":
  if (key.ctrl) {
    const result = jumplist.back(ctx.getState())
    if (result) {
      ctx.setState(() => result.state)
      jumplist.apply(result.jump, ctx)
    }
    return
  }
  break

case "tab": // Ctrl-i surfaces as "tab" in terminal input
  const result = jumplist.forward(ctx.getState())
  if (result) {
    ctx.setState(() => result.state)
    jumplist.apply(result.jump, ctx)
  }
  return
```

Remove the existing `case "tab":` view-toggle handler; add a new `gv` sequence
in the chord block that calls `toggleViewMode`.

### Edge cases

- Empty jumplist: `Ctrl-o` and `Ctrl-i` are no-ops.
- At list head / tip: swallow silently.
- Consecutive duplicate locations: skip the push (coalesce).
- Files list changes (refresh/resync): entries with stale `fileIndex` are
  resolved via `anchor.filename` lookup when applied; drop the entry if the
  file no longer exists.
- `Tab` currently toggles view mode — migration note: mention the rebinding
  in the help overlay (`g?`).

### Testing

Unit tests for `push` / `back` / `forward` semantics (truncation, cap, empty,
tip edges, coalesce). Integration-ish test for `apply` with a fake ctx
asserting it calls the right helpers.
