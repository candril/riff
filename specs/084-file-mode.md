# File Mode

**Status**: Done

## Description

riff only ever opened diffs: a pull request, a revset, the working copy. A
file nobody touched cannot be opened at all, so the loop in `.riff/` — write
a comment, hand it to Claude, resolve it — can only ever talk about lines
someone changed.

`riff <path>` opens the path as files. A file becomes a unified diff whose
every line is context, and from there it is the diff pipeline: folds, flash,
`/`, the file tree, markdown tables, mermaid, peeks and spec 080's
highlighting all arrive without a code path of their own.

This is the seam the rest of [the plan](./083-file-mode-plan.md) stands on.
It does not carry comments — a note on unchanged code is spec 085, and until
it lands file mode refuses the composer rather than writing something no
publish path could honour.

## Out of Scope

- Notes on those lines. 084 refuses them out loud; 085 makes them real.
- A tree and picker built for ten thousand files. 084 reads a bounded number
  of files eagerly; 087 is where that stops being true.
- Outline and occurrences (088).
- Any write to a file riff shows.

## Capabilities

### P1

- `riff src/app.ts` opens one file, expanded. `riff src/` and `riff .` open
  every file under the path, each one collapsed — the shape you browse a
  repository in, and the reason a few hundred files open instantly.
- A path that exists beats a revset. The PR forms match first, then the
  filesystem, then the fallthrough to a revision that riff has today. `-r
  <rev>` forces the revision on a repo where a directory and a bookmark
  share a name.
- A file is a diff with no changes: one hunk spanning the file, every line
  context, both sides carrying the same number. Nothing downstream learns a
  new shape.
- `c`, `C` and the comment panel's `n` are refused with a line saying why.
  The lines are marked as sitting outside a diff, which is what riff already
  says about expanded context, so the refusal costs no new gate.

### P2

- `rg --files` lists a directory. Without ripgrep on the PATH riff says so
  once and walks the tree itself, skipping `.git`, `node_modules` and the
  config's ignore patterns: cruder, still usable.
- A file riff cannot read as text — bytes that are not UTF-8, or more than
  512 KB of them — is listed and opens as one line saying which it was,
  rather than as garbage.
- Past 2000 files riff opens the first 2000 and says how many it left. The
  honest number beats a hang; 087 is what removes the ceiling.

## Technical Notes

`getLocalDiff` returns a unified diff as a string and everything downstream
parses it. File mode is a second producer of that string, so `parseDiff`,
`buildFileTree`, `DiffLineMapping` and the comment store are untouched.

`DiffLineMapping` takes an `outsideDiff` option and answers every row the
way it already answers an expanded one: `getCommentAnchor` returns null,
`isOutsideDiff` returns true, and both composer routes already explain that
refusal. 085's work is splitting that answer into "no anchor" and "no
publisher", not adding a gate here.

`parseDiff` reads a file whose two sides are identical as a modification,
because a modification is the only thing a diff can call it. File mode
relabels its files `unchanged` afterwards, so the tree does not put an `M`
against code nobody touched.

`AppMode` stays `local | pr`. File mode is a source a local review reads
from, not a third mode: notes land in the same `.riff/comments/local` store
as working-copy comments, which is what spec 086 needs of it.
