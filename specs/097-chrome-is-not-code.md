# Chrome Is Not Code

**Status**: Done

## Description

A collapsed run of context is one row saying `▸ 502 lines  ↵`, and that row
is inside the text riff hands the highlighter. It is not a line of any
language, so a parser reading the section hits it and guesses from there on.

On a GraphQL schema the guessing is unmistakable, because `on` is a keyword
there and it lands inside words and inside strings:

```
  "Catalogue price, before any discount — as on the plan."     ← `as`, `on` painted as keywords
  monthlyPrice: Money @semanticNonNull                         ← the `on` of `monthlyPrice`
  "Discount on this add-on alone; null when it has none."      ← `on`, `null`, `none`
```

Taking the chrome out is worth a little under half of it, and no more. The
same five rows, parsed three ways:

| what the parser is handed | highlights on a bare `on`/`as`/`null`/`none` |
|---|---|
| the chrome above them and below | 11 of 15 |
| the rows alone | 6 of 15 |
| the rows inside their `type` | 0 of 22 |

So the chrome is a cause but not *the* cause: a fragment of a file is not a
file, and the only reading that comes out right is the one taken from the
file itself — which is spec [080](./080-highlight-from-the-file.md), and
which is why this is a small fix rather than the fix. What it buys is the
half that riff was doing to itself: nothing in the text handed to a parser
now pretends to be code that no one wrote.

The label keeps its place by being painted over the blank row, the way the
gutter and the overflow markers are already painted.

## Out of Scope

- Making a fragment parse right. That is spec 080's job, and the table above
  says it is the only thing that does; this stops riff from making a
  fragment worse than it already is.
- **When riff reads a file for its colours.** Spec 080's P1 says the text is
  fetched "when the file is on screen", and `requestHighlightSource` asks
  only for the file the cursor is in — so a file the reader can see, but has
  not put the cursor in, keeps the fragment reading and everything in this
  spec's table applies to it. That gap is spec 080's to close.
- The fold marker of a fenced block (spec [073](./073-fold-code-blocks.md)).
  Its row *is* the opening fence, and the mapping says so — the cursor and a
  comment anchor both read that content, so it is not riff's to blank.
- The file header, which its own component draws and which was never in the
  parsed text.

## Capabilities

### P1

- **A section's parse is the diff's own lines and nothing else.** Where a
  collapsed-context divider sits, the highlighter is handed a blank row —
  which every language treats as whitespace, where no label riff could
  invent is valid in all of them.
- **The label reads as it did.** `▸ 502 lines  ↵`, or `⟳ Expanding …` for
  the one riff is fetching, dim and italic on the divider's own background.
- **It stays put when the view scrolls sideways**, like the gutter and for
  the same reason: chrome is not source, and there is nothing to its right
  to scroll towards.
- **Nothing moves.** Every line number, comment anchor, search match, fold
  and cursor column still points where it did — only the characters on one
  row change, and the mapping never held those characters anyway.

## Technical Notes

The mapping and the render already disagree about a divider, which is what
makes this safe: the mapping's `content` is `502 lines`, and the `▸` and the
`↵` are added by `formatDivider` at build time. So the cursor, which reads
the mapping, never saw the drawn text; blanking the drawn row takes away
characters nothing depended on.

Both content builders format the divider — `buildSectionContent` for the
all-files view and `buildDiffContent` for one file — and both now push an
empty row instead. The label is drawn in the post-process pass that already
repaints the gutter, after it, so a gutter scrolled over the left edge still
wins the columns it covers.

The overlay draws at a row's `contentX`, which is the unscrolled content
origin (`code.x + scrollLeft`) and therefore the boundary between gutter and
code at any scroll position. That is what pins the label: `contentX`
corresponds to the leftmost *visible* column of the line, so the text sits
against the gutter rather than sliding away from it.

`buildDiffContent`'s `file-header` case is dead either way — only
`parseAllFiles` emits that row, and the all-files view draws it as its own
component.
