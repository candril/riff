# Narrowing the Occurrences

**Status**: Done

## Description

`Ctrl-s` (spec 088) answers "where does this appear". The answer is often
too long: `parseHunk` is in the parser, its tests, three callers and a
fixture, and the question was about the callers. Refining the query does
not help, since the word is the same everywhere. What has to narrow is the
list: keep the hits under `src/vim-diff`, or leave out the tests.

snacks.nvim's grep does this with `Ctrl-g` (`toggle_live`). It freezes the
grep, and the prompt then filters the results by file and text. `Ctrl-g`
again goes back to the grep with the filter kept.

```
  Occurrences  parseHunk ›                     ^g search   9 in 3 files   esc
  > vim-diff !test
 ──────────────────────────────────────────────────────────────────────────
  src/vim-diff/line-mapping.ts                                        4
    88 +  const hunk = parseHunk(line)
```

## Out of Scope

- Fuzzy matching. The list is in diff order and grouped by file, not ranked,
  so a subsequence match over a whole line of code would keep nearly every
  row. Terms are literal.
- Field prefixes (`file:`, `+`/`-` for the row kind). The scope toggles in
  088's P2 cover the row kind.

## Capabilities

### P1

- `Ctrl-g` in the occurrence picker switches the prompt between the search
  (088's query) and the narrowing filter. Each keeps its text, so switching
  back resumes where it was left.
- The filter is whitespace-separated terms, and a row must match all of
  them. A term matches when the row's file path or its text contains it,
  literally and smart-case, like the query. `!term` keeps only rows where
  neither contains it. A lone `!` is no term.
- The search is always what finds the hits. The filter only removes hits,
  and an empty search still lists nothing.
- Every occurrence of a narrowing term is highlighted in teal, in the row
  and in the file header, so it is visible why a row was kept. The search
  match stays yellow and is drawn over a term it overlaps, since it is where
  the cursor lands. A `!term` highlights nothing, since the rows it keeps
  are the ones without it.
- While narrowing, the header shows the frozen search followed by `›`. It
  also shows which mode `Ctrl-g` switches to, and the counts are of the
  narrowed list.
- Typing in either prompt resets the selection to the first hit.
- `Esc` closes the picker and clears both. Reopening starts in search mode
  with no filter.
- Help (`g?`) mentions `Ctrl-g`.

## Technical Notes

- `OccurrencePickerState` gains `filter: string` and `narrowing: boolean`.
- `findOccurrences(rows, query, filter)` drops rows the filter rejects
  before counting, so the totals, the per-file counts and the 1000 cap all
  describe the narrowed list. Each hit carries `narrowSpans` over its text
  and each group `pathSpans` over its filename.
- The prompt key is `occurrence-picker:search` or `occurrence-picker:narrow`.
  A new key re-seeds the shared field (spec 065), which is how switching
  modes shows the other string.
- `input.ts` handles `Ctrl-g` and prevents the default, so the field never
  sees it.
