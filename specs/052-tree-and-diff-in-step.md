# Tree and Diff in Step

**Status**: Done

## Description

Picking a file used to narrow the diff to it. That is a decision — "I am
reviewing this file alone" — and both entry points made it on the user's
behalf: `Ctrl+f` and `Enter` in the tree threw away the surrounding diff,
the scroll position and the cursor, when all that was asked for was to get
to a file.

The tree and the diff are now two views of one position. Picking a file
scrolls the diff to it; moving through the diff moves the tree's highlight;
scrolling with the mouse drags the cursor along so both stay true.

## Out of Scope

- Removing the single-file view. It is still the right thing when a file
  needs reading with nothing else on screen — it just stopped being what
  every file pick does.
- Auto-expanding the tree to reveal a file inside a collapsed folder while
  scrolling. Scrolling past a fold should not undo it.
- Syncing in the other direction while the tree is focused: `j`/`k` there
  moves the highlight without moving the diff, on purpose.

## Capabilities

### P1 - MVP (implemented)

- **Picking a file scrolls to it.** `Enter` in the tree and `Enter` in the
  file picker move the cursor to the file's header in the all-files diff
  and leave the rest of the diff standing.
- **Picking while narrowed still swaps.** With a single file open, picking
  another opens that one, rather than dropping back into the whole diff.
- **A way into the single-file view**: **Open File Alone** in the action
  menu narrows to the file at the cursor. `Esc` still leaves it.
- **The tree highlight follows the cursor**, and the tree scrolls to show
  it. Skipped while the tree has focus or a multi-select range is open.
  Unfocused, the row is drawn with the subtler "the file you are in"
  background rather than the cursor's, so the tree answers where you are
  without claiming focus — the panel used to draw its highlight only when
  focused, which made the sync invisible.
- **The cursor follows a mouse scroll**, the way vim keeps the cursor in
  the window.

## Technical Notes

### Reveal instead of select

`revealFile()` in `features/file-navigation/handlers.ts` is the shared
path: find the file's header line in the mapping, move the cursor there,
reveal it, and point `treeHighlightIndex` at the file. It deliberately
does not touch `selectedFileIndex`, so no line mapping rebuild is needed.

A file the mapping has no row for — hidden or ignored — has nothing to
scroll to, so it falls back to `handleSelectFile()` and opens on its own.

### Highlight sync

`syncTreeHighlightToCursor()` runs from `updateFileTreePanel()`, which is
already on every render, so it catches every way the cursor can move
(motions, search, flash, jumplist, `]f`) without hooking each one. It is a
no-op in the single-file view, while the tree has focus, and while
`treeSelectionAnchor` is set.

### Cursor follows the scroll

A wheel scroll moves `scrollTop` and nothing else — no key is pressed, so
no handler runs. `VimDiffView.dragCursorIntoView()` notices in the
post-process pass that the cursor's row has left the window and reports the
line it should move to (`setOnCursorScrolledAway`).

Two properties keep it from fighting anything:

- the cursor is moved to fit the view, never the view to fit the cursor —
  the app must not call `ensureCursorVisible()` in response, or the wheel
  and the reveal would fight;
- no scrolloff margin is enforced against the ends of the diff, where
  there are no rows to hold in reserve. Without that guard the cursor gets
  dragged off line 1 as soon as the view is at the top.

`VERTICAL_SCROLL_OFF` moved into `VimDiffView` and is imported by the app,
so both halves agree on what "in view" means.

### File Structure

```
src/features/file-navigation/handlers.ts   # revealFile
src/features/file-tree/input.ts            # Enter reveals
src/features/file-picker/input.ts          # Enter reveals
src/app.ts                                 # highlight sync, scroll callback
src/components/VimDiffView.ts              # dragCursorIntoView
src/actions/registry.ts                    # Open File Alone
```
