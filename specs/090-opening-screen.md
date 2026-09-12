# The Opening Screen

**Status**: Draft

## Description

`riff .` opens on the first file in the tree, alphabetically. It is a
deterministic answer to "which file" and a meaningless one: `build/…/docker-bake.hcl`
is where nobody wanted to start.

What a reader wants on opening a repository is the question riff has not
asked yet: what has moved, what was being read, what is worth looking at
first. The files that changed recently, the files with open notes against
them, the files this reader had open last time.

## Out of Scope

- Anything that reads a file riff was not pointed at.
- Replacing the tree. This is where you land, not how you navigate.

## Open questions

- What is on it? Recently changed files (`git`/`jj` know), files carrying
  open notes (`.riff/` knows), files read last session, files changed on the
  current branch.
- Where does "recently read" come from? nvim keeps one — `shada`'s oldfiles —
  and reading it would mean riff opens on what the reader was actually in.
  That is a file format and a dependency; worth it only if the list is the
  thing that makes the screen useful.
- Is it a view (`i`/`a`/`d` have a free letter) or the thing `riff .` lands
  on before a file is chosen?
- Does it belong to file mode alone, or does a PR get one too — where "what
  moved" has a much better answer already.

## Technical Notes

Spec 084 opens on `filesDiff.selected ?? files[0]`. This replaces the second
half of that expression.
