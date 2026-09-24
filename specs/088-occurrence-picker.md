# Occurrence Picker

**Status**: Ready

## Description

`/` answers "take me to the next one". The other question — *where does this
appear at all* — has no answer in riff: you search, press `n`, and rebuild
the picture in your head one match at a time. Telescope's `live_grep` answers
it in one list.

`Ctrl-s` opens a prompt over the change set: type, and every row of the diff
that matches is listed, grouped by file. `Enter` goes there.

```
  Occurrences  parseHunk                                      31 in 6 files
 ──────────────────────────────────────────────────────────────────────────
  src/vim-diff/line-mapping.ts                                        4
    88 +  const hunk = parseHunk(line)
   112    if (!parseHunk(raw)) continue
  src/utils/diff-parser.ts                                           12
    17 -  export function parseHunk(line: string) {
```

This takes over [spec 071](./071-occurrence-picker.md), which drafted the
idea, and replaces the `rg`-based occurrences [plan 083](./083-file-mode-plan.md)
had in mind for 088.

## Out of Scope

- `rg`, or any read of the worktree. The change set is not the worktree: a
  PR's files come through `gh`, and `riff <ref>` or a commit in scope is a
  diff between two refs. The diff is already in memory, so the picker
  searches that.
- Lines outside the hunks. The diff's rows are the corpus, so a hit is
  always a row riff can draw. Searching whole changed files means fetching
  every file first (one `gh` call per file on a PR) and is a separate spec.
- File mode (084). It works there because a file is a diff with no changes,
  but nothing here is designed for a repo-sized corpus.
- The `gO` outline 083 grouped with this.
- Replacing `/`. In-view search stays what it is; this is the list view of
  the same question.

## Capabilities

### P1

- `Ctrl-s` opens the picker from every view (diff, overview, feed). The
  composer keeps its own `Ctrl-s` — the overlay's input handles the key first.
- The corpus is every file in the change set as loaded (`state.files`,
  which a commit scope already narrows), including files that are collapsed,
  hidden by the tree filter, or out of the single-file view. Finding what
  you cannot see is the point.
- Rows searched: additions, deletions and context rows of each hunk. Diff
  headers (`diff --git`, `@@`, `+++`, `---`) are not, as with
  `diffContainsMatch`.
- The query means what `/` means: literal, case-insensitive, one compiled
  pattern from `SearchEngine.compilePattern`. The two do not disagree.
- Incremental — the list narrows as you type. It uses the shared prompt
  input (spec 065), as the file and comments pickers do.
- One entry per matching row (not per match), grouped under a file header
  that carries the per-file count. The title shows the total and the number
  of files. Each row shows the new line number (old for a deletion), the
  `+`/`-`/space marker, and the row's text with the match highlighted.
- Navigation: `↑`/`↓`, `Ctrl-p`/`Ctrl-n`, skipping file headers. `Esc`
  closes and leaves the cursor where it was.
- `Enter` switches to the diff view if needed, makes the row reachable
  (opens the collapsed file, or selects the file when the mapping does not
  list it), puts the cursor on the row, starting at the match's column, and
  scrolls it into view. The jump lands in `Ctrl-o`'s list (spec 089).
- Nothing matches: an empty list and `0`, no toast. An empty query lists
  nothing.
- Help (`g?`, `riff --help`) and the action menu list it.

### P2

- `Enter` also seeds `/` with the query, so `n`/`N` walk the same matches
  from where you landed.
- Opening with the cursor on a word, or with a visual selection, pre-fills
  the query, like `*`.
- Matches inside comment bodies, listed after the code under their own
  header and opening the thread on `Enter`: "where is this discussed" is the
  same question.
- Scope toggles inside the picker: current file only, added lines only.
- A preview of a few rows around the selected hit.

## Technical Notes

### Corpus

Build the rows once when the picker opens, not on every keystroke. Parse
each file's `DiffFile.content` hunk by hunk the way `line-mapping.ts` does
(`@@ -a,b +c,d @@` sets both counters; `+` advances new, `-` advances old,
space advances both) into:

```ts
interface OccurrenceRow {
  fileIndex: number
  filename: string
  kind: "addition" | "deletion" | "context"
  lineNum: number        // new side, or old side for a deletion
  side: "LEFT" | "RIGHT" // LEFT for a deletion
  text: string           // without the marker
}
```

Keep the rows in the picker's state, or memoized on `state.files` identity,
so a refresh (`gr`) or a commit-scope change rebuilds them. A regex over a
few MB of text is milliseconds. Cap the list at 1000 rows and say so in the
title (`1000+`) rather than render a lockfile's worth of hits.

### Jumping

`DiffLineMapping.findLineForComment({ filename, line, side })` already maps a
file line on either side to a visual row, so there is no new lookup to write.
Order of operations, following `jumpToComment` in
`features/comments-picker/index.ts`:

1. `switchView(s, "diff")` when not in the diff.
2. In single-file view on another file: `handleSelectFile(fileIndex)`.
   Otherwise `ensureFileExpanded(filename)`.
3. If the file is still not in the mapping (the tree filter hides it), fall
   back to `handleSelectFile` — `revealFile` does the same.
4. `findLineForComment`; set the cursor line and `col` to the match start;
   `ensureCursorVisible`.

A row inside a folded code block (spec 073) needs the fold opened; check
whether `findLineForComment` finds rows under a fold before relying on it.

### Shape

A fourth picker next to files, comments and commits. Copy the comments
picker's layout rather than extracting a shared shell in the same change;
extracting it is worth its own change once this one works.

- `src/features/occurrence-picker/` — `index.ts` (open/close, jump),
  `corpus.ts` (rows from `DiffFile[]`), `filter.ts` (query → grouped
  entries), `input.ts` (keys, as `comments-picker/input.ts`).
- `src/components/OccurrencePicker.ts` — the overlay, modelled on
  `CommentsPicker.ts`.
- `state.ts` — `occurrencePicker: { open, query, selectedIndex }` with
  open/close/set-query/move-selection reducers; add it to the
  "a modal is open" checks next to `commentsPicker` (`state.ts` ~1015,
  `render.ts` ~705).
- `app/render.ts` — a prompt entry in the prompt-config chain next to
  `comments-picker`, and the overlay.
- `app/global-keys.ts` — route input to the picker while it is open, and
  a `case "s"` branch for `key.ctrl` in the global switch. The existing
  `case "s"` is flash and already requires `!key.ctrl`.
- `src/index.ts` help text and `HelpOverlay.ts`. The CLI help still lists
  `Ctrl+g` as "Show the current file's path"; it is the commit picker. Fix
  that line while there.

### Tests

- `corpus.test.ts`: line numbers across multiple hunks, deletions on the
  old side, headers excluded, a renamed file, a file with no hunks.
- `filter.test.ts`: literal matching (`.` and `(` are not regex), case,
  grouping and counts, the cap.
- Check it in the running app: a hit in a
  collapsed file, a hit in a file the tree filter hides, a deletion, and
  `Ctrl-o` back.
