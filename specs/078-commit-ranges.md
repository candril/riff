# Commit Ranges

**Status**: Done

## Description

`Ctrl-g` scopes the diff to one commit. A review rarely divides that neatly:
"the three commits that moved the parser" is one change told in three, and
reading them one at a time means holding the first two in your head while
you read the third.

Mark a span in the picker and read it as one diff.

```
  Select Commit                                               esc
  ▏ 613ccaa  fix: the last thing                    @you   2m ago
  ▍ 5644f30  feat: the middle of it                 @you  24m ago
  ▍ 7823e1d  feat: where it started                 @you  27m ago
    c64f035  something else entirely                @you  29m ago
```

## Out of Scope

- Picking commits that are not next to each other. Two patches with a gap
  between them are not a diff any VCS can produce: the ones in between
  decide what the later ones apply to. A span is the honest unit.
- Reordering or editing commits. riff reads history, it does not rewrite it.

## Capabilities

### P1

- `v` in the commit picker anchors a span at the highlighted commit;
  moving extends it; `Enter` scopes the diff to the whole span; `v` again
  drops the anchor. A span of one is what `Enter` alone already did.
- The scope is the cumulative diff from the oldest marked commit's parent
  to the newest — what the range did, not the three patches concatenated.
- The header says which span is in view: `commits 2–4/7`.
- `]g` / `[g` still walk one commit at a time, and `Esc` in the diff still
  puts the whole range back.

## Technical Notes

`viewingCommit` keeps meaning "the newest commit in scope" so permalinks,
the jumplist and `]g` need no changes; `viewingCommitFrom` names the oldest,
and equals it for a single commit. The diff cache is keyed `from..to`.

`state.commits` is newest-first in both modes, so the older end of a span is
the higher index, and the commit after it in the list is the parent the
range is measured from. Each provider gets the two ends:

```
jj      jj diff --git --from <oldest>- --to <newest>
git     git diff <oldest>^ <newest>
GitHub  compare/<parent of oldest>...<newest>
```
