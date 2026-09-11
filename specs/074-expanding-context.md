# Expanding Context

**Status**: Done

## Description

A diff shows the hunks and nothing else, and the collapsed runs between them
are riff's way of offering the rest. Three things about that offer were
wrong: it rode on `za`, which is a fold key; the run after the last hunk
carried a count riff had not measured, or did not appear at all; and while
one run was being fetched, every other run in the file said it was loading
too.

## Out of Scope

- Collapsing an expanded run again. Expanding is one-way: `gr` re-reads the
  diff, and folding the file hides it.
- Expanding context riff cannot reach — a PR whose file it cannot fetch
  says so rather than guessing.

## Capabilities

### P1

- `Enter` on a collapsed run opens it. `za`, `zo`, `zc`, `zR` and `zM` leave
  it alone: a fold hides what you can see, expanding fetches what the diff
  never carried, and one key should not mean both.
- The row says which key opens it, since it is no longer the fold key.
- The run after the last hunk is offered whether or not riff knows the
  file's length. Until it does, the row says **rest of the file** rather
  than a number it is guessing at; once the file is in hand the count
  appears, or the row goes away because the hunk reached the end after all.
- Only the run being fetched for shows the spinner.

## Technical Notes

The loading state was per file (`fileContentCache[name].loading`) and every
divider in that file read it. It is per divider now — `expandingDivider`,
one key at a time, since only one can be asked for at a time.

An unmeasured end run is `endLine === 0` in the mapping's divider builder,
which is the one place that knows whether the file's lines are in hand.
