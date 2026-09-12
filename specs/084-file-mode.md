# File Mode

**Status**: Done

## Description

riff only ever opened diffs: a pull request, a revset, the working copy. A
file nobody touched cannot be opened at all, so the loop in `.riff/` — write
a comment, hand it to Claude, resolve it — can only ever talk about lines
someone changed.

`riff <path>` opens the path as files. riff lists what the path scopes, opens
one file of it, and that file becomes a unified diff whose every line is
context — from there it is the diff pipeline: folds, flash, `/`, the file
tree, markdown tables, mermaid, peeks and spec 080's highlighting all arrive
without a code path of their own.

This is the seam the rest of [the plan](./083-file-mode-plan.md) stands on.
It does not carry comments — a note on unchanged code is spec 085, and until
it lands file mode refuses the composer rather than writing something no
publish path could honour.

## Out of Scope

- Notes on those lines. 084 refuses them out loud; 085 makes them real.
- A tree and picker built for ten thousand files. 084 lists them and leaves
  the tree as it is; 087 is where that stops being true.
- Outline and occurrences (088).
- Any write to a file riff shows.

## Capabilities

### P1

- One file is open at a time. There is no view of a repository as every file
  end to end: nobody reads one that way, and the tree is how you move between
  them.
- `riff src/app.ts` opens that file with the repository listed around it — a
  tree of one file is a tree you cannot leave. `riff src/` and `riff .` list
  what they scope and open the first file of it.
- The tree opens folded, except the path down to the open file. Eight hundred
  files listed flat is not a tree. Reaching a file — through the tree, the
  picker, anything — opens the path to it.
- Only the open file is read. A path names where to start, not a thousand
  files to pull off the disk, so `riff .` is a listing and the read happens
  as you arrive in a file.
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
- Past 10000 files riff lists the first 10000 and says how many it left. The
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

A listed file is a diff header with no hunk, which parses to a file with no
rows; opening it splices the read content into `files[i].content` and rebuilds
the mapping. The same seam therefore carries both states, and an unopened
file costs a line of string.

The run after the last hunk is what spec 074 offers to expand. A file has no
such run — its one hunk is the whole of it — and offering it anyway drew a
row that expanded into nothing, because the expansion reads a file cache the
row's own content had never been put in.

`AppMode` stays `local | pr`. File mode is a source a local review reads
from, not a third mode: notes land in the same `.riff/comments/local` store
as working-copy comments, which is what spec 086 needs of it.
