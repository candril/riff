# Highlight From the File

**Status**: Done

## Description

riff hands the highlighter the rows it is drawing, joined together, and lets
tree-sitter parse that as if it were the file. It is not the file: it is
fragments with the gaps taken out and both sides of the diff interleaved. A
hunk that starts inside a block comment is parsed as code —

```
  16  * line 12 of the explanation      ← `*` an operator, `line` an identifier, `12` a number
```

— and the reader sees a comment that looks like an expression. Strings,
template literals and JSX do the same thing.

There is no fixing this from the visible text: the missing information is
the parser's state where the hunk begins, and only the hidden text has it.
But "the file" is not "all the code" — one file, the one you are looking
at, fetched the way riff already fetches one to expand context.

## Out of Scope

- Parsing every file in the diff. A 200-file PR is 200 parses nobody asked
  for; this is per file, as it comes into view.
- Anything riff cannot get the text for. A filetype with no parser, a file
  too big, a fetch that fails: the rows look exactly as they did before.

## Capabilities

### P1

- A file's rows are highlighted from the file's own text, so a hunk that
  starts inside a comment, a string or a template literal is that, and a
  fold in the middle of a function does not end the function.
- The text is fetched once per file, when the file is on screen, and cached
  with the content riff already caches for expanding context. Local mode
  reads it from disk; PR mode asks for it the way it already does.
- Until it arrives — and when it cannot be had at all — the rows are
  highlighted as they are today. Nothing waits for a parse.
- riff's own rows keep their own styling: the fold markers and file headers
  are chrome, not source.

- A file riff was told not to show — a lock file, generated code — is not
  a file riff reads. Nor is one too big to be worth parsing: that is a
  generated bundle, and its colours are worth nothing.
- Deletions are highlighted from the old version's text, which arrives in
  the same read. Without it a deleted line keeps the fragment parse's
  reading, which is worse than nothing once its neighbours are right —
  `regionCode` came out with `on` as a keyword inside it.

## Technical Notes

`CodeRenderable.onHighlight` is already the seam: search results are
injected through it, and it can replace the ranges wholesale. So the shape
is — parse the real file with the renderer's `TreeSitterClient`, map the
file's line numbers onto the visual rows the section is drawing, and hand
back ranges in the section's own offsets.

The mapping is the fiddly half: a visual row knows its file line
(`newLineNum`), so a highlight on file line N moves to whichever row carries
N, and highlights on lines no row carries are dropped. A highlight spanning
several file lines is cut at each one — the rows are not neighbours in the
file, and a range across them would paint whatever sits between. A row the
file has no line for — a deletion, a fold marker — keeps whatever it has.

Caching: one parse per (file, content), thrown away when the content changes,
and the two dozen most recent files kept. The parse is the expensive half,
not the mapping, which is redone per frame because the rows move with every
fold.

The text is asked for when the cursor arrives in a file — noticed in the
render loop, where a lookup and an early return cost nothing — and read
quietly: no loading state, no error state, 150ms after arriving, so walking
a review with `]f` reads nothing. The same cache answers the
expand-context feature, so a file read for its colours is already read for
its context.
