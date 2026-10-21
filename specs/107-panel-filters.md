# Panel Filters

**Status**: Done

## Description

A long review leaves its side panels full of what is already dealt with:
resolved and outdated threads in the thread panel, viewed files in the file
tree. Each panel gets one toggle that narrows it to what is still open, so
the reader sees what is left without losing the rest, which is a key away.

## Out of Scope

- Filtering the diff. Only the panels narrow: the diff, its thread markers,
  `]f`/`[f` and `]r`/`[r`/`]R`/`[R`, the feed and the PR overview keep
  every file and every thread.
- Any filter beyond these two. The panels' `/` filter is its own feature
  and the toggles narrow what it leaves.

## Capabilities

### P1

- **Open only, in the thread panel**: `H` hides resolved and outdated
  threads with all their replies. Detail in
  [039](./039-inline-comment-overlay.md), "Open threads only".
- **Unviewed only, in the file tree**: `H` hides viewed files, drops a
  directory left empty and keeps the file you are on. Detail in
  [003](./003-file-navigation.md), "Unviewed only".
- **The same key in both**, `H`, read by whichever panel has focus.
- **Palette actions**: "Show Only Open Threads" and "Show Only Unviewed
  Files".
- **Help rows** in `g?` under "Panels & Files".
- **The header says so**: `open only · N hidden` (threads) and
  `unviewed only · N hidden` (files), in the filter's colour.
- **Kept per review** in `.riff/<review>/panels.json` (`openThreadsOnly`,
  `unviewedFilesOnly`), and read again when riff switches review.

## Technical Notes

- `src/storage/caches.ts`: `PanelFilters` and `updatePanelFilters`, which
  serialises its writes so two quick toggles cannot lose one.
- Thread panel: `src/features/inline-comment-overlay/input.ts`,
  `src/components/thread-panel-model.ts`.
- File tree: `src/app/tree-unviewed.ts`, `src/features/file-tree/input.ts`,
  `src/components/file-tree-model.ts`; every reader of the tree's rows asks
  `treeRowsOf` in `src/components/FileTree.ts`.
- Actions: `src/actions/registry.ts`; help rows:
  `src/components/help-sections.ts`.
