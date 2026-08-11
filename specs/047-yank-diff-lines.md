## Yank Diff Lines

**Status**: Done

## Description

Copy code out of the diff view: `y` yanks the visual-line selection, or the
cursor's line when nothing is selected. `Y` yanks the same rows with their
`+`/`-` gutter intact.

## Out of Scope

- Operator-pending motions (`yw`, `y3j`). This is a viewer, not an editor —
  select with `V` and yank.
- Named registers. There is one clipboard.
- Yanking from the file tree or comments panel.

## Capabilities

### P1 - MVP

- `y` copies the selection (or cursor line) without the diff gutter, so it
  pastes straight into an editor.
- `Y` keeps the gutter, for quoting a change in a comment.
- Structural rows (file headers, dividers, spacing, `\ No newline`) are
  skipped, so a selection spanning a file boundary yields only code.
- Yanking leaves visual mode, as vim does.
- Both are in the palette, labelled for the active scope.

## Technical Notes

`DiffLine.content` is the line without its prefix and `rawLine` keeps it, so
the two modes are one field choice. The row filter lives in `SKIPPED_TYPES`.

### Clipboard flush

`copyToClipboard` now awaits the helper process. It previously wrote to
`pbcopy`'s stdin and returned immediately, which is a race: a copy followed
closely by quitting riff, or by another copy, lands nothing. Reproduced
directly — reading the clipboard right after the call returns an empty
string, and the value appears ~150ms later. All callers await it now.

`features/pr-info-panel/input.ts` still shells out through
`sh -c 'echo … | pbcopy'` in several places and has the same race (plus a
quoting hazard); left alone here.
