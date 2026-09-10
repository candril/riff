# Refresh in Place

**Status**: Done

## Description

`gr` reloads everything and puts you back at the start: the cursor jumps to
the top, the file you were reading is deselected, the search is cleared, and
in PR mode the view snaps back to the overview because a full reload runs
through `createInitialState`. Refreshing to see whether anything arrived
costs your place, so you stop refreshing.

A refresh should change the data and nothing else.

## Out of Scope

- Incremental refresh. This keeps the full reload; only the restoring is new.
- Preserving a position that genuinely no longer exists. When the line is
  gone, riff lands nearby and says so rather than pretending.

## Capabilities

### P1

- The view you were in survives — diff stays diff, and PR mode no longer
  snaps back to the overview.
- The diff cursor returns to the same **line of the same file**, found by
  identity (filename, line number, side) rather than by index, because the
  rebuilt mapping renumbers every row.
- The selected file, the file-tree highlight, the panel's section and its
  scroll all survive.
- The search pattern survives, with its matches recomputed against the new
  diff.
- Folds survive, except where the new data decides otherwise (a file that
  became viewed collapses as it does today).
- When the anchor cannot be found — the line was deleted, the file is gone,
  the branch was force-pushed — riff lands on the nearest hunk in that file,
  then the file's header, then the top, and toasts which of those happened.
- The comment poll's merge never moves the cursor either.

## Technical Notes

`handleRefresh` rebuilds state with `createInitialState(...)`, which is what
resets `viewMode`, and then calls `setVimState(createCursorState())` and
`setSearchState(createSearchState())`. The fix is to snapshot before and
re-apply after, not to unpick the rebuild.

The anchor is the same trick the search reveal uses (`captureAnchor` /
`relocate` in `vim-diff/search-handler.ts`): remember what the row *pointed
at*, then look it up again in the rebuilt mapping.

A force-push is detectable — the old head SHA is no longer an ancestor of the
new one — and is worth naming in the toast, because "your line moved" and
"the branch was rewritten" deserve different reactions from the reader.
