# Commit Ranges

**Status**: Done

## Description

`Ctrl-g` scopes the diff to one commit. A review rarely divides that neatly:
"the three commits that moved the parser" is one change told in three, and
reading them one at a time means holding the first two in your head while
you read the third.

Mark what you want and read it as one diff.

```
  Select Commit  3 marked                                V: stop extending
  / to filter
    ● All commits                                                69 commits
      613ccaa  fix: the last thing                      @you         2m ago
      5644f30  feat: the middle of it                   @you        24m ago   ← marked
      7823e1d  feat: where it started                   @you        27m ago   ← marked
      c64f035  something else entirely                  @you        29m ago
```

## Out of Scope

- Reordering or editing commits. riff reads history, it does not rewrite it.

## Capabilities

### P1

- `j`/`k` move, `Space` marks the commit under the cursor, `V` marks a run
  from here — moving drags its end along — and `V` again keeps the run and
  lets the cursor leave it. `Enter` scopes the diff to what is marked, or to
  the row under the cursor when nothing is.
- Marked rows are coloured rather than badged: a column of bars reads as
  decoration, a block of colour reads as a selection.
- A forty-commit list is read, not searched, so the letters belong to the
  list: `/` is what asks for the filter, and what it found stays visible
  beside the list once accepted.
- Reopening the picker shows what is in scope, cursor on the first of them.
  Choosing a scope is a thing you adjust, not a thing you retype.
- The header says what is in view: `commits 2–4/7` for a run, `3 commits of
  7` when they are not next to each other.
- `]g` / `[g` still walk one commit at a time, and `Esc` in the diff still
  puts the whole diff back.

## Technical Notes

A run of commits has one cumulative diff — from the oldest one's parent to
the newest — and that is what riff shows, rather than its patches laid end
to end. Commits picked with gaps between them have no such diff: the ones in
between decide what the later ones apply to. There riff shows their patches,
oldest first, and a file two of them touched carries both sets of hunks,
which is what `git log -p` would have shown.

`viewingCommit` keeps meaning "the newest commit in scope" so permalinks,
the jumplist and `]g` need no changes; `viewingCommitScope` lists the rest.
The diff cache is keyed by the shas in it.

`state.commits` is newest-first in both modes, so the older end of a run is
the higher index, and the commit after it in the list is the parent the run
is measured from.

```
jj      jj diff --git --from <oldest>- --to <newest>
git     git diff <oldest>^ <newest>
GitHub  compare/<parent of oldest>...<newest>
```
