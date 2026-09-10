# Fold Code Blocks

**Status**: Done

## Description

A markdown file's diff is prose with a forty-line mermaid or JSON fence in
the middle of it. The fence is one thing — you either want to read it or you
want it out of the way — but the diff has no way to say so, and reading the
prose around it means scrolling past the whole of it.

A file folds. A collapsed run of context folds. A fenced block should fold
the same way, under the same keys.

## Out of Scope

- Folding by syntax. A `{` … `}` in a source file is a different feature
  and a much larger one; a fence is delimited by the file itself.
- Remembering folds across sessions. They are a reading posture, not a
  review artefact.

## Capabilities

### P1

- `za` on any row of a fenced block folds it to its opening fence, which
  says what it was and how much is hidden: ```` ```mermaid  ▸ 23 lines ````.
  `za` again opens it.
- `zo` / `zc` open and close the block under the cursor, before the file's
  own fold — the fence is the thing in the way, the file is what is left.
- `zA` folds or unfolds every block in the file under the cursor: a document
  that is mostly diagrams reads as prose.
- `zR` opens everything, blocks included. `zM` folds every file and every
  block, so opening one file back up shows its prose rather than its
  diagrams.
- A block only folds when both of its fences are on screen. A fence whose
  partner is outside the hunk is a run of text riff has no business hiding.

## Technical Notes

The fold happens in `DiffLineMapping`, after the markdown tables are
aligned and before anything reads a row: the folded rows are spliced out and
their opening fence keeps their place. Every index below it then counts the
block as one row, which is what the cursor, the comment anchors and the
search all read.

A block's id has to survive a rebuilt mapping, which renumbers every row —
so it is the file, the side, and the fence's own line number, the same
trick the refresh anchor uses (spec 063). A folded row carries that id,
because its closing fence is no longer in the mapping to be found by
scanning.
