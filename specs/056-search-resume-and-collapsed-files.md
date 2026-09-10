# Search Resume & Collapsed Files

**Status**: Done

## Description

Two things a search should do and did not: survive being dismissed, and look
inside the files that are folded shut.

`Esc` clears the highlights. The pattern used to go with them, so `n`
afterwards did nothing at all — the pattern had to be retyped. It is now
remembered, and `n`/`N` pick it back up.

A file marked viewed is collapsed, and a collapsed file's rows are not in the
line mapping the search reads — so a match inside one was invisible.
Confirming a search now opens every collapsed file the pattern hits and looks
again.

## Out of Scope

- Searching the context hidden behind a `▸ N lines` divider. That text is not
  in the diff at all; reaching it means loading each file's full content,
  which in PR mode is a request per file.
- Reversing the reveal. Files stay open once a search has opened them, the
  way vim leaves a fold it opened for a match.
- Searching files the tree filter is hiding. A filter is a deliberate
  restriction; unfolding a file it excludes would not put a row on screen
  anyway.

## Capabilities

### P1

- `Esc` keeps the last confirmed pattern and its direction; `n`/`N` resume
  it, recomputing the matches against the mapping as it stands now.
- Abandoning a `/` prompt with `Esc` leaves the *previous* search intact —
  the abandoned text was never confirmed and never becomes the last pattern.
- `Enter` on a search opens the collapsed files whose diff the pattern hits,
  then searches again over the reopened rows, so the cursor lands on the
  first match in the diff rather than the first one that was on screen.
- `*`, `#` and a resumed `n` open collapsed files the same way.
- Only a file's own code counts: a pattern that matches `diff --git`, `@@` or
  `+++` does not open a file whose content it never appears in.
- The cursor keeps its row across the reveal, even though opening a file
  above it shifts every index below.

## Technical Notes

`lastPattern` and `lastDirection` sit in `SearchState` next to the live
pattern, and `clearSearchKeepingLast` is what `Esc` resets through.

Incremental search deliberately does not reveal anything: expanding files on
every keystroke would shuffle the view under the cursor while typing, and
unfolding is not undone when the next character narrows the pattern again.
The reveal happens once, on confirm.

Whether a collapsed file matches is decided from its raw diff text, not from
a mapping built for it — the file is already in `state.files`, and this only
has to answer yes or no.

Expanding rebuilds the mapping, so every row index below the opened file
moves. The position a search runs from is therefore captured as what it
pointed at — a filename and a line number — and found again afterwards
(`captureAnchor`/`relocate`).
