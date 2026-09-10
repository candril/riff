# Occurrence Picker

**Status**: Draft

## Description

`/` answers "take me to the next one". The other question — *where does this
appear at all* — has no answer in riff: you search, press `n`, and rebuild
the picture in your head one match at a time. Telescope's `live_grep` and
snacks.picker answer it in one list.

`Ctrl-f` narrows what is on screen (spec 065). This is its opposite number:
type a word, get every place it occurs, and pick one.

```
  Occurrences  parseHunk                                      31 in 6 files
 ──────────────────────────────────────────────────────────────────────────
  src/vim-diff/line-mapping.ts                                        4
    88  +  const hunk = parseHunk(line)                                  ▐
   112     if (!parseHunk(raw)) continue
  src/utils/diff-parser.ts                                            12
    17     export function parseHunk(line: string) {
```

## Out of Scope

- Searching the repository. This is the diff riff has open — the files, the
  comments, and (later) the feed — not a `rg` front end over the worktree.
- Replacing `/`. In-view search stays what it is; this is the list view of
  the same question.

## Open questions

- One key or two? `Ctrl-g` is free and reads as *go to*; `gs` collides with
  sync. Whatever it is, it should be one key from every view.
- Does a hit in a collapsed or filtered-out file appear? Probably yes, with
  the file opened on the way in — the point is to find what you cannot see.
- Regex or literal? `/` compiles a regex; a picker's query is usually fuzzy.
  They should not disagree about what a query means.

## Capabilities

### P1

- A prompt over the whole diff: every occurrence, grouped by file, with the
  line number and the line's text, count per file and overall.
- Incremental — the list narrows as you type, like every other prompt
  (spec 065), and uses the same input widget.
- `Enter` jumps to the occurrence, opening the file if it is collapsed;
  `Esc` leaves the cursor where it was.
- Matches inside comments are in the list too, marked as comments rather
  than code: "where is this discussed" is the same question.

### P2

- A preview of the hit in its surrounding lines, the way the comments picker
  shows a thread.
- Scope toggles: this file only, added lines only.

## Technical Notes

`SearchEngine.findAllMatchesInMapping` already finds every match in the
current mapping, but the mapping is only what is *visible* — collapsed files
are not in it. The picker needs the whole diff, which means matching against
`DiffFile.content` per file (what `diffContainsMatch` already does for the
search reveal) and mapping a hit back to a visual line on jump, the same way
`relocate` does in spec 063.

The picker itself is the fourth of its kind: files, comments, commits,
occurrences. They differ only in what they list — worth extracting the shared
shell when this one lands rather than copying it a fourth time.
