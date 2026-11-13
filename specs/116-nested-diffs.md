# Nested Diffs

**Status**: Done

**Not built**: P2, P3

## Description

Some files are diffs themselves: a `.patch` a repo carries for a vendored
dependency, or a document kept as `<Name>.md.diff`, the whole text with `-`
for what a system does today and `+` for what it should do. Reviewing a
change to such a file in riff shows a diff of a diff. Every line starts with
two markers, `+-` or `++` or `+ `, and the reader decodes them by eye while
the inner diff, the part the file is about, gets no colour at all.

riff reads such a file as the diff it contains. The inner markers become the
line's colour, as in any diff riff draws. What the change being reviewed did
to the file (the outer diff) moves to the gutter. In the split view the two
halves are the inner diff's two sides, so a `.md.diff` reads as its two
documents side by side, and a change in the review lands visibly on one of
them.

A document that turns into its `.diff` form in a review is a deleted `X` and
an added `X.diff`: every line gained a marker, so git sees no rename. riff
draws the deleted `X` against the inner new side of `X.diff`, so the
conversion shows only what it actually changed instead of the whole file in
red.

## Out of Scope

- **Files that are not named as diffs.** Detection is by name; a diff pasted
  into a `.txt` or a markdown code block stays text.
- **Editing.** As everywhere in riff, the view is read-only.
- **Rendering the inner document as markdown** (`gR` on a `.md.diff`).
- **Comparing the old and new inner sides of a modified `.diff` file as two
  separate diffs.** The split view shows which inner side a change lands on,
  which answers the same question in one view.

## Capabilities

### P1 - Reading the inner diff

- **A `.diff` or `.patch` file is read nested** wherever it shows: in a PR,
  in a local diff and in file mode. Every line inside a hunk keeps its row,
  line numbers, comment anchors, marks and jumps; only its look changes.
- **Inner markers become colour.** The leading `-`, `+` or space is removed
  from the text, and the line is tinted as riff tints a removal, an addition
  or context. An inner `--- a` / `+++ b` pair and `diff --git`, `index` and
  `@@` lines are kept as text, untinted and dimmed. An empty line counts as
  inner context (editors strip the trailing space).
- **The outer change goes to the gutter.** In a modified file, a line the
  review added gets a green bar and line number, and a line it removed gets
  red ones. An added or deleted file has no outer change to show: every line
  would carry the same mark.
- **Split view pairs the inner sides.** The left half holds the inner old side
  (context and `-` lines), the right half the inner new side (context and `+`
  lines), with the inner header pair as the first row: `--- observed` facing
  `+++ contract`. A comment still anchors to the line's place in the file
  under review, whichever half it is written in.
- **Highlighting by the inner file type.** `X.md.diff` is highlighted as
  markdown and `X.ts.patch` as TypeScript. Each inner side is parsed as one
  document, so a fence or a table on one side does not leak into the other.
  A markdown table lines up as in a `.md` file.
- **Word diff on the inner pairs.** A run of inner `-` lines followed by `+`
  lines shows the changed words, as an outer removal and addition do. In a
  modified file, an outer removal followed by an outer addition shows the
  words the review changed.
- **`gN` shows the raw diff again**, per file, and `gN` once more returns to
  the nested view. The file header says `nested` while a file is read nested.
  The palette lists it as "Toggle Nested Diff".

### P1 - A document turning into its diff

- **A deleted `X` with an added `X.diff` or `X.patch` in the same review is
  drawn against the added file's inner new side.** Lines both have are
  context, lines only `X` had are removals, and lines only the inner new side
  has are additions, numbered as lines of `X.diff`. The header says
  `vs X.diff` with the inner new side's label, e.g. `vs FetchPaymentMethod.md.diff +++ contract`.
- **Comments land on the real files.** A removal or context line in its left
  half anchors to `X`'s old line. An addition, or context in its right half,
  anchors to the line of `X.diff` it came from.
- **`gN` on `X` brings back the plain deletion.**

### P2 - Reading it more closely

- The toggle remembered for the review, like `gR`'s.
- `]n` / `[n` to the next inner change, skipping the context between.

### P3

- Detecting a diff by content (a `--- ` / `+++ ` header pair in the first
  lines) for files not named as one.

## Technical Notes

### The mapping keeps the outer lines

The nested view is a display transform, as aligned markdown tables are: the
mapping parses the outer diff as for any file, then rewrites each content
line of a nested file in place (`src/features/nested-diff/nest.ts`). The row
count, `type`, `oldLineNum` and `newLineNum` are the outer diff's, so
anchors, keys, marks, folds and the jumplist are untouched. The line gains:

```ts
interface DiffLine {
  /** What the line is in the diff it contains (spec 116). */
  inner?: InnerLineType  // context | addition | deletion | old-header | new-header | meta
  /** What the review did to it, in a modified file only. */
  outerChange?: "addition" | "deletion"
}
```

`content` loses the inner marker and `sourceContent` keeps the file's line,
so yank and hashes read the file.

### Where a line is drawn

`type` says which version of the file under review a line lives in.
`shownType` (`src/diff-rows/shown-type.ts`) says how it is drawn: for a
nested line, the inner type. Everything presentational asks `shownType`:
pairing the halves, tints, the cursor line, the pane a line opens in,
comment signs and the word diff. Everything about the file under review
(anchors, numbering, the file parses of spec 080) keeps asking `type`.

### Pairing

`src/features/nested-diff/pairing.ts` finds a deleted `X` beside an added
`X.diff`, takes both texts from their own diffs (an added or deleted file's
diff is the whole file), and line-diffs `X` against the inner new side by
LCS, with the common head and tail trimmed first and a cap on the table
size. Rows on the inner new side carry `newLineNum` in `X.diff` and
`pairedFile: "X.diff"`, which `getCommentAnchor` uses for a `RIGHT` anchor.

### State

`src/features/nested-diff/state.ts`: the files shown raw (the default is
nested), as a set of filenames, cleared on a switch to another review.
