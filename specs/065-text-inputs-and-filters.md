# Text Inputs & Filters

**Status**: Done

## Description

Every box you type into in riff behaves slightly differently, because most of
them are hand-rolled: the `/` search prompt keeps its own string and
reimplements backspace and `Ctrl-w`; the action menu, file picker, comments
picker and commit picker each track a `query` and handle characters
themselves. The file-tree filter is the exception — it focuses a real
`InputRenderable`, which is why word deletion, word motions, paste, undo and
selection all work there and nowhere else.

Every text entry should be that input, and `Ctrl-f` should mean the same
thing — *narrow what I am looking at* — in every view.

## Out of Scope

- The comment composer, which is already a real textarea.
- A query language. `Ctrl-f` filters by substring; the feed's type filters
  are separate keys (spec 070).

## Capabilities

### P1

- The search prompt (`/`, `?`), the action menu, the file picker, the
  comments picker, the commit picker and the feed's filter all use the same
  input widget.
- `Ctrl-w` deletes a word, `Ctrl-u` the line, and word motions, paste, undo
  and selection work, in all of them, because none of it is riff's code.
- Incremental behaviour is unchanged: search still moves the cursor as you
  type, pickers still filter per keystroke. The input reports changes; the
  feature reacts.
- `Ctrl-f` opens the filter for whatever has focus — files in the diff and
  tree, rows in the feed, sections and rows in the info panel, comments in
  the panel.
- `Esc` cancels and restores what was there; `Enter` accepts. The same two
  keys everywhere.

## Technical Notes

`SearchHandler` owns `promptValue` and implements `handleCharInput`,
`handleBackspace` and `handleDeleteWord` by hand — that is the code being
deleted, not moved. What stays is `updatePattern`, which becomes the change
handler.

The tree filter (`features/file-tree/input.ts`) is the working model: keys go
to the focused `InputRenderable` and riff only intercepts Enter, Escape and
the one backspace case that closes the prompt. Returning `true` without
`preventDefault` lets the input still see the key — that is the trick worth
copying.
