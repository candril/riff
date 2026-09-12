# The Agent Queue

**Status**: Done

## Description

This is what [the plan](./083-file-mode-plan.md) exists for. riff writes
comments to `.riff/`, `riff comments --json` hands them to Claude, `riff
comments resolve` retires them — and until spec 085 that loop could only
ever describe a diff. Now a note can sit on any line of any file, and
`.riff/` is a review-shaped queue of work over the whole codebase.

Most of what that needs was already there: the store is repo-wide, the
report already carries the anchored code, and resolving a note is resolving
a comment. Three things were not.

An agent handed the whole repository's notes has no way to be handed one
corner of it. The payload does not say which comments were written where
GitHub could never take them, which is the difference between "fix this
before the PR merges" and "someone left a note here". And a note is pinned
to a line of a worktree that keeps being edited, with nothing watching it —
so one inserted line above turns it into a note about the wrong code,
silently.

## Out of Scope

- Rewriting the comment when its line moves. The report says where the line
  went; the comment still records where it was written. Moving the anchor is
  a write, and reading a queue should not write to it.
- Anything that reaches GitHub. `riff comments` has never touched it.

## Capabilities

### P1

- `riff comments --path <p>` narrows to a file, or to a directory and
  everything under it. `.riff/` is a repository's worth of comments and an
  agent is usually being handed one corner.
- Every thread in the JSON says its `kind` — `note` or `review`. They ask
  for the same work and they mean different things about urgency.
- Every thread says where its line is now: `here`, `moved` with the line it
  moved to, or `lost`. Read from the hash written with the comment, against
  the worktree as it stands. `null` where there is nothing to compare —
  a comment older than the hash, a file riff cannot read.
- The plain listing marks a note `[note]`, so the human running the same
  command is told the same thing.

## Technical Notes

The search runs outwards from the line the comment was written on, so the
nearest match wins — code repeats itself, and the same line fifty lines
away is not where the reader was looking. Past `DRIFT_WINDOW` lines it is
called lost rather than guessed at.

The hash is of the trimmed line, so reindenting a block does not invalidate
every note in it.

`positional()` exists because `riff comments --path src` read `src` as the
`<target>` and reported on a source nobody asked for: the parser dropped
flags but kept their values.
