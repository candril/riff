# One List

**Status**: Done

## Description

Your notes live in `.riff/comments/local/`. A pull request's comments live
in `.riff/comments/gh-owner-repo-N/`. They are filed apart for a good
reason — a pull request has an identity and a worktree does not (spec 049) —
and nobody asking "where is there something to deal with" cares about any of
that.

The editor made you ask it twice: one key listed your notes, another drew
the review, and only on the file you already had open.

## Out of Scope

- Merging the stores. They stay apart; only the answer is joined.
- Reading a review riff has never fetched. `--all` reads what is on disk;
  `riff comments fetch` is what puts it there.

## Capabilities

### P1

- `riff comments --json --all` is one report over both: your notes for this
  worktree, and the comments on the pull request for the branch you are on.
  Each thread still says its `kind`, its `author`, and the `resolve` and
  `remove` commands for the store it actually came from.
- The plain listing prints both, each under its own source.
- No pull request for the branch is not an error — there is simply nothing
  to add, and your notes are the answer.
- `:RiffList` in nvim uses it, tagging each row with the author or `note`,
  and jumps to where the line is *now*.

## Technical Notes

Two reports concatenated rather than one report over a merged list: the
`commentFile` a thread carries and the `resolve` command it prints are only
right for the store it came from, and a merged list would have to carry the
source per comment to get them right anyway.

`--all` resolves the pull request, which costs a `gh` call. That is why it
is a flag: `riff comments` stays the local, offline thing it has always
been, and pays for the network only when asked.
