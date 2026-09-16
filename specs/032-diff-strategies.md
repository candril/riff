# Alternate Diff Strategies

**Status**: Draft

## Description

What riff shows is git's line diff: a run of deletions, a run of additions,
and the reader pairing them up. Two things go beyond that shape — a diff
that understands syntax rather than lines (difftastic), and two panes
instead of one (split view). Both are worth having and neither is worth the
row model.

The third thing people mean when they ask for either of these is the change
*within* a line, and that is [096](./096-word-diff.md), which is done and
needs none of this.

## Out of Scope

- **A structural diff as the row model.** riff's rows are git's rows, and
  that is what makes a comment postable: a GitHub review comment anchors to
  a line and a side in the diff *GitHub* computed. Rows from a structural
  diff no longer map onto that, which turns specs
  [048](./048-comment-anchor-limits.md) and
  [085](./085-comments-on-files.md)'s "riff has the line, GitHub cannot
  anchor to it" from the edge case into the normal one. A structural diff
  also emits no `@@` headers, so expanding context (spec
  [074](./074-expanding-context.md)) and the line-keyed comment storage in
  `.riff/` have nothing to work from.
- Building an AST differ. difftastic exists.
- Three-way merge views, and configuring git's difftool.

## Capabilities

### P2 - difftastic as a span provider

- **Spans, not rows.** difftastic answers one question: which parts of these
  two lines are the change. Git's diff still decides which rows exist and
  which line each row is, so nothing downstream of the mapping moves.
- **Off unless asked for, and only where it can answer.** A probe for the
  `difft` binary, a config flag, and nothing at all for a file whose
  language it has no parser for — see the Technical Notes on why the
  textual fallback is worth less than what riff already computes.
- **Per file, as it comes into view**, the way spec
  [080](./080-highlight-from-the-file.md) reads a file for its colours, and
  from the same two versions it already holds.
- **Local diffs first.** Both versions are on disk there. A PR needs two
  blob fetches per file before difftastic can be handed anything.

### P3 - Split view

- The old file on the left, the new on the right, lines aligned by
  unchanged content, and the cursor in one pane at a time.
- Falls back to unified below a terminal width that makes two panes
  legible. Two gutters and a file panel leave roughly half of what is left
  per side.

## Technical Notes

### What difftastic gives

`DFT_UNSTABLE=yes difft --display json OLD NEW` returns, per file, a
`language`, a `status`, and chunks of per-side lines. Each line carries a
0-based `line_number` and the changed nodes as ranges into it:

```json
{ "lhs": { "line_number": 1,
           "changes": [ { "start": 17, "end": 24, "content": "\"Hello\"", "highlight": "string" } ] },
  "rhs": { "line_number": 1,
           "changes": [ { "start": 17, "end": 21, "content": "\"Hi\"",    "highlight": "string" } ] } }
```

Four things about that output decide how much it is worth:

- **The offsets are UTF-8 bytes.** riff's highlight ranges are JS string
  offsets. In `const s = "héllo wörld 🎉 done"`, the last word starts at byte
  30 and at index 25 — and 🎉 alone is four bytes and two UTF-16 units. A
  conversion pass sits between the two, and spec
  [082](./082-emoji.md) guarantees the input to exercise it.
- **The granularity is the syntax node, not the word.** Editing one word
  inside a string literal reports the whole literal as changed, every token
  of it. Within a token difftastic is coarser than the token LCS spec 096
  already runs.
- **The textual fallback says nothing.** No parser means
  `language: "Text"`, and then every token on a changed line is reported
  changed — the whole line, which is where riff started.
- **The format is unstable.** It refuses to emit without `DFT_UNSTABLE=yes`
  and says so in as many words.

What difftastic is uniquely good at is above the line: a reindent, a moved
brace or relocated code does not fool it. That fixes *pairing*, which is
the part spec 096 solves by refusing the pair rather than by understanding
it.

The cost is small enough to do per file, off the render path: 78ms and 7.5KB
of JSON for a 3000-line TypeScript pair, because only changed chunks are
reported.

### Where it would plug in

Everything the integration needs exists. `FileVersions` and
`setFileContents` hold both versions of a file and already run an async
parse per side, refreshing the highlights when it lands.
`writeSnapshotFile` in `src/features/external-tools/handlers.ts` already
writes both versions to temp paths for `gd` (spec
[075](./075-diff-in-editor.md)), which is the two paths difftastic wants.
`mapFileHighlights` in `src/vim-diff/file-highlights.ts` takes ranges
carrying file line numbers and returns them in the offsets of the rows on
screen. And `CodeRenderable.onHighlight` is the seam that accepts them.

So difftastic joins as a third async producer beside the two tree-sitter
parses, keyed on `oldLineNum`/`newLineNum`, upgrading the spans of a pair
whose language it understands.

### What split view would cost

The renderer draws one content column. A section is a `LineNumberRenderable`
gutter wrapping one `CodeRenderable`, and every coordinate in the view —
`paneBounds`, `codeWindow`, `contentOriginX`, `revealColumn`,
`clampColumnToWindow`, `getColumnStatus`, the gutter, selection, flash and
overflow overlays, and the terminal cursor — resolves against that single
origin. Split means each of them takes a side. That is the bulk of the
work, not the layout.

Two specific problems sit underneath it:

- **Sidescroll.** Spec [051](./051-long-lines.md) is built on the scroll
  box's one `scrollLeft`, with content as wide as its widest line. Two
  panes inside one scroll box are one wide row, so scrolling right slides
  the right pane off the screen. Split needs two column windows riff
  manages itself — and at half width sidescroll matters more, not less.
- **Wrap.** At half width a left line wraps to three rows while its partner
  wraps to one, and the panes lose their alignment. Either the pairs are
  re-padded to the taller side after layout — per-pane wrap indices
  everywhere the row math goes — or wrap and split are mutually exclusive.

OpenTUI's own `DiffRenderable` has a `view: "split"` and does all of this,
including wrap alignment. riff does not render through it — it builds its
own sections so that folds, comment signs, search and the vim cursor have
somewhere to live — so what that buys is the pairing algorithm: group a
hunk's removals against its additions, pad the shorter side, which is forty
lines.

The vim side is the cheap half. Motions read `mapping.getLineContent(line)`
and never touch a coordinate, so an active side on the mapping leaves
`h l w b e f t`, the text objects and visual mode working as they are. Row
indices can stay shared between the panes, since the padding makes both
sides the same height. Comments come out *better*: `CommentAnchor.side` is
inferred from the row's type today, and in two panes it is simply the pane
the cursor is in.
