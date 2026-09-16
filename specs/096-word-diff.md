# The Words That Changed

**Status**: Done

## Description

A changed line is two rows, one red and one green, and the reader finds the
change by comparing them character by character. On a short line that is
free. On a line with one renamed identifier, one flipped argument or one
edited string, it is most of the work of reading the review:

```
- const reply = await api.getTravelESimContract(contractId, cancellation)
+ const reply = await api.getTravelESimContracts(contractId, cancellation)
```

The information is there — the two rows differ in one place — and riff
already knows how to paint part of a row: search matches are ranges injected
into the highlighter, and they land on columns, not lines. The change spans
are the same shape, so the spans that actually differ carry a brighter
background and the rest of the line keeps the red or green it has.

## Out of Scope

- A structural diff. What is paired here is what git paired; the spans are
  found inside a pair, never across lines. See
  [032](./032-diff-strategies.md) for difftastic and why it does not
  replace the row model.
- Rewriting the row model. A comment anchors to a line and a side, and
  nothing here changes which line a row is.
- A split view. Two panes is [032](./032-diff-strategies.md) as well.

## Capabilities

### P1

- **The spans that differ are brighter.** Within a paired deletion and
  addition, the runs of text that changed carry a stronger background than
  the line's own; everything the two lines share keeps the line colour. The
  reader's eye goes to the change rather than to the pair.
- **Syntax colours survive it.** The span sets a background and nothing
  else, so a string stays green and a keyword stays mauve underneath. A
  word diff that repainted the foreground would be trading one kind of
  reading for another.
- **A pair too different is left whole.** Where the spans would cover most
  of both lines there is nothing left for them to narrow the reader's eye
  to: the two rows are a deletion and an unrelated addition that happen to
  sit together in the run, and all they hold in common is punctuation.
  Painting a token here and there across them says they are two versions of
  one line, so nothing is painted and both rows stay as they were. Most of
  *both*, because a short line rewritten into a long one is worth seeing
  from the long side — what is covered there is what was built around it.
- **Indentation is not common ground.** Two lines at the same depth always
  share their leading whitespace, and counting it as agreement is how four
  levels of nesting wave an unrelated pair through: twelve leading columns
  are a quarter of a line that nobody wrote. What a line says is measured
  from where it starts saying it.
- **A change that is everywhere is in no place.** Past a handful of spans
  the pair is not localising anything — reflowed prose, where two versions
  of a sentence share most of their words in a different order and the
  alignment dutifully paints every gap between them. Pointing at all of a
  line points at none of it, so it is left whole.
- **Whitespace alone is not a change worth painting.** A reindent moves
  every column of the line; painting the moved indentation is a block of
  colour that says nothing about what the line now does. A span that is
  only whitespace is dropped.
- **Search wins.** A match inside a changed span is a search match first:
  the reader is looking for it, and it is the one thing on screen they
  asked to see.

## Technical Notes

`CodeRenderable.onHighlight` is the seam, as it is for search
(`injectSearchHighlights`) and for the file's own parse (spec
[080](./080-highlight-from-the-file.md)). The hook composes in order, and
a later range wins per property, so the layering is: the file's
highlights, riff's own rows stripped, then the word spans, then search.
Because the span's style sets only `bg`, the merge keeps the foreground
that the syntax scope underneath it put there.

Spans are found per pair, in two steps. Both lines are cut into tokens —
runs of word characters, runs of whitespace, single characters otherwise —
and a longest common subsequence over the tokens — weighted by the
characters a token is worth, so one long identifier is preferred to three
stray brackets — says which of them the two lines share. The tokens that
are not in it become the spans, adjacent ones merged, and what those spans
then cover — of what each line says, its indentation excluded — is what
gates the pair, along with how many of them there are.

The two numbers are calibrated against real diffs rather than guessed. Over
a 118-file span of riff's own history, four fifths of the painted pairs come
out at one or two spans and the tail past four is reflowed prose, which is
where the count is cut; and three unrelated pairs from a C# converter, all
indented twelve columns, sit at 0.50, 0.43 and 0.59 of their full length but
at 0.69, 0.75 and 0.95 of what they say, which is where the indentation
comes out of the measure.

Pairing is positional. Git emits a change as a run of deletions followed by
a run of additions, and an unchanged line between two changed ones splits
the run rather than sitting inside it — so the nth deletion and the nth
addition are two versions of one line whenever they are versions of
anything at all. Where the runs are uneven the tail has no partner and is
left whole. Nothing tries to guess a better matching: the similarity gate
already refuses the pairs where the positional guess was wrong, which is
the same answer and considerably less machinery.

The cost is bounded by the pair, not the file: the LCS is quadratic in
tokens, so a pair whose sides are both enormous — a minified bundle's one
long line — is cut back to the common prefix and suffix instead, which is
one span per side and linear. The spans are computed once per mapping,
beside `buildLineWidths`, and read per frame; a fold or a refresh builds a
new mapping and so recomputes them.

Rows riff wrote itself are skipped, the way the highlighter already skips
them. A row whose `content` is a display transform — an aligned markdown
table, where the truth is in `sourceContent` — would need its spans mapped
back through the padding to be right, and a table cell is not where this
earns anything; a folded fence's row says `` ```ts ▸ 5 lines `` and is
chrome rather than source. An empty line on either side has no spans to
find, and `\ No newline at end of file` sits between the two runs without
ending the change.
