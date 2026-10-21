# Global Marks

**Status**: Done

**Not built**: the file tree's mark letters (P2's second bullet) wait for M4's port of the tree.

## Description

A large PR is read out of order. The reader goes through the files that
matter, finds the three places the change really hinges on, and then keeps
returning to them: the new interface, the one caller that uses it oddly,
the test that pins it. Today getting back means the file picker, the tree
or a search each time, and none of them remembers *where in the file* the
reader was.

Marks give those places a letter. `ma` marks where the cursor is, `'a`
goes back to it from anywhere in the review, and `''` flips between
the last two marks visited, the way `<C-^>` flips between two buffers. A
list shows every mark with its file and line, the way harpoon's menu does,
so the set of places a review revolves around is one key away.

Every mark is global. Vim splits marks into lowercase ones local to a
buffer and uppercase ones across files, but a review is one long buffer of
many files, and a mark that only works inside the current file is the thing
the reader does not need. So `a`–`z` and `A`–`Z` are all global, and the
mark state [012](./012-vim-navigation.md) left without a key becomes this.

## Out of Scope

- **Buffer-local marks.** A mark is global whatever its letter.
- **Marks shared with others or published to GitHub.** A mark is the
  reader's bookmark, not a comment.
- **Marks across reviews.** A mark belongs to the review it was set in,
  the same scope as viewed state.
- **Reordering by drag or numbered slots beyond the letters.** The letters
  are the slots.

## Capabilities

### P1 - Set and jump

- **`m{a-zA-Z}` sets a mark** at the cursor: the file, the line on its side
  of the diff, and the side. A letter already in use moves to the new
  place. On the line where that mark already sits, `m{letter}` removes it
  instead, and the status bar says "Mark a removed", so a stray press is
  seen and pressing again sets it back. A mark sits on the row it lands on
  exactly, seen from either pane in unified and from its own side's pane
  in split.
- **`'{a-zA-Z}` jumps to a mark** from anywhere: another file, all-files or
  single-file mode, a folded file (which unfolds). The jump is recorded in
  the jumplist ([089](./089-jump-history.md)), so `Ctrl-o` comes back.
- **`''` flips between the last two marks visited.** From any position, it
  goes to the mark visited before the current one; pressed again, it comes
  back. Before two marks have been visited it does nothing and says so.
- **Marks anchor to the file's line, not the row on screen**, the way a
  comment anchor does. Folds, expanding context, wrap, the split view and a
  refresh that brings new commits do not move them. A mark whose line no
  longer exists in the diff lands on the nearest line still there, and
  says it moved.
- **Marks persist** with the review in `.riff/<source>/marks.json`, so a
  review resumed tomorrow has them.
- **Marks show in the diff's gutter.** A marked line shows its letter in
  a gutter cell of its own beside the comment sign, so a line can carry
  both. In split it is on the mark's side. A file mark shows on the file's
  header row, and on the sticky header pinned for that file. The letter is
  in an accent colour (mauve) that reads apart from the comment signs'
  colours. The cell is kept whether any mark is set, so setting the first
  mark never moves the code.

### P1 - The list

- **One key opens the list** of every mark: letter, file, line and the
  line's text, in letter order. `Enter` jumps, typing filters the way the
  other pickers do, and `Ctrl-x` deletes the selected mark. No picker
  deletes anything today, so the key is new; it cannot be a printable
  letter, because typing filters.
- **The key is `Ctrl-k`.** It is free today. `Ctrl-m` is not possible: a
  terminal sends it as the same carriage return as `Enter`. `Ctrl-a` is a
  common tmux prefix, and `Ctrl-b` toggles the sidebar.

### P2 - Moving through the marks

- **`]m` and `[m` step to the next and previous mark** in letter order
  (`a`–`z`, then `A`–`Z`), wrapping at the ends: the harpoon walk through the places a review
  revolves around.
- **The file tree shows a file's marks** as their letters beside its name,
  so the marked files stand out in a long tree.

### P3 - Marks on files

- **A mark set on a file header row marks the file**, not a line: jumping
  to it opens the file at its top, which is what a mark on a file without
  a diff body (binary, too large) has to mean anyway.

## Technical Notes

- A mark is stored as `{ letter, filename, line, side, text?, head? }`,
  with `side` as `CommentAnchor` has it. `text` is the marked line's source,
  untrimmed and without the diff prefix; `head` is the PR head `line` was
  last checked against, and local reviews leave it out. A file mark has
  `line: null` and no text, and a line marked on expanded context has no
  text either. Resolving a mark to a row goes through
  `DiffLineMapping`, which already answers "which row shows this file's
  line on this side" for comments; the split view reads the active side
  from the same answer.
- Marks follow their code. On every load and refresh a mark is looked for
  again by its text within 50 lines of its old number, nearest first and
  the upper on a tie; found, it moves there silently and the marks are
  saved with the new line and head. A renamed file carries its marks to
  its new name. Expanded context is not in the patch, so a mark set there
  could only be found again on some other line that reads the same; it
  carries no text and keeps its number. Entries without `text` resolve by
  number alone.
- A missing line resolves the way a comment thread that drifted does: the
  nearest surviving line in the same file, else the file header. A line
  whose number survives but whose text is not the marked text counts as
  missing too: the jump lands on it and says the line is gone.
- `''` keeps two letters, `current` and `previous`, in memory only; a
  session starts with neither.
- The gutter's letter sits on the row `resolveMark` returns, so it shows
  where `'x` lands, a nearby or file landing included.
- `marks.json` sits beside `viewed.json` and `visit.json` and is written
  the way those are, through `storage`.
- The keys go through the keymap layers spec 100 introduces (M6). If 101
  is built before M6 finishes, they go into the diff's key handling like
  the other sequences, and move with it. The list's keys are a keymap
  layer in `src/features/marks/picker-keys.ts`.
