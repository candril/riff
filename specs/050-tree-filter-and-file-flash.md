# Tree Filter & Flash to a File

**Status**: Done

## Description

Two ways to get to a file without walking to it.

- **`/` in the file tree** filters it by path. The tree stays a tree — the
  matches keep their directories — but everything else drops away, so a
  60-file review narrows to the three files you meant.
- **`s` in the all-files view** now labels file headers as well as code, so
  a flash jump can land on a file by typing part of its path. The header's
  content *is* the full path, so this needed no new matching rule.

Both reuse what riff already has: the pickers' fuzzy matcher for the filter,
flash's existing labelling for the jump. Neither adds a keymap to learn —
`/` is the search key, `s` is the jump key.

## Out of Scope

- Filtering by anything but the path (status, viewed, comments). The action
  menu has **Toggle Hidden Files**, and `]u` walks unviewed files.
- Persisting the filter across sessions. It is a way to get somewhere, not
  a view setting.
- Flash across the whole diff rather than the viewport. Off-screen files are
  what `Ctrl+f` and the filter are for.

## Capabilities

### P1 - MVP (implemented)

**Tree filter**

- `/` with the tree focused opens a prompt in the panel header; the header
  becomes `/query` with a cursor while typing.
- Typing narrows the tree live. Matching is `fuzzyMatch` against the **full
  path**, so `apicl` finds `src/api/client.ts` and a directory name matches
  everything under it.
- `Enter` keeps the filter and returns to navigating it; `Esc` drops it.
  `Backspace` on an empty query closes the prompt.
- With a filter applied, `Esc` clears it before the next `Esc` leaves the
  panel — one layer per press, after the multi-select anchor.
- Surviving directories are returned expanded (a filter that hid its results
  behind a fold would be useless); the user's own expansion state is left
  alone and comes back when the filter clears.

**Flash to a file**

- `file-header` joins `context` / `addition` / `deletion` in flash's
  `JUMPABLE_TYPES`. Single-file mappings have no header line, so this is an
  all-files-view feature by construction.
- The label draws on the first character of the path, which meant giving the
  header's filename `Text` an id and reading its column back — the header row
  starts left of the code gutter, so the section's `contentX` would have put
  the label in the wrong place.

### P2

- Filter and flash both ignore `showHiddenFiles`-hidden files, matching the
  tree's own rule.

### P3

- A count of what the filter hid, the way the ignored-file count is shown.

## Technical Notes

- `treeFilter` / `treeFilterInput` live in `AppState` because eight call
  sites resolve the highlighted tree item from `getVisibleFlatTreeItems`, and
  every one of them has to see the same list the panel draws — otherwise the
  highlight index addresses a different node than the one on screen. The
  filter is a fifth parameter there, passed by all of them.
- The prompt is dispatched **before** the global single-key handlers in
  `global-keys.ts`, alongside flash and search. Without that, typing a path
  would toggle the PR view on `i` and quit riff on `q` — the panel handler
  runs near the end of the chain.
- `filterTree` returns new nodes for the directories it keeps and shares the
  file nodes; nothing mutates the tree in state.
