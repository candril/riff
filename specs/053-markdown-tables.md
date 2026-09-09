# Markdown Tables

**Status**: Done

## Description

A markdown table is the one thing in a diff that cannot be reviewed as
source. It fails in two opposite ways:

- **Unaligned source** is a wall of pipes. There are no columns to scan,
  and no way to see which cell a change landed in.
- **Hand-aligned source** is worse. One character in one cell reflows every
  row's padding, so the diff marks the whole table changed and the real
  edit drowns in it.

Padding the cells at display time answers both. A `-` row ends up
cell-for-cell above the `+` row that replaced it, which is what makes a
one-cell change visible; and because the padding is applied to what is
drawn rather than to the file, an unaligned source stops mattering.

## Out of Scope

- Rendering the table with borders *in place of* the diff's source. A
  comment anchors to a line, and a bordered table collapses N source lines
  into a different number of rows with no line to point at. `gt` puts the
  grid in an overlay instead, where nothing has to anchor.
- Rewriting the HTML inside cells in the diff. There the source *is* the
  artefact under review; the overlay and the comment renderer are free to
  interpret it.
- Reformatting the file. Nothing here writes.

## Capabilities

### P1 - MVP (implemented)

- Table rows in `.md` / `.markdown` / `.mdx` files are padded onto one
  grid per table, computed across every row of the block — both sides of
  the diff, so deletions and additions share the grid.
- `:---` / `---:` / `:---:` in the delimiter row set the cell alignment;
  the delimiter row itself is redrawn as a rule of the right width.
- A hunk that shows a table without its delimiter row is still aligned; it
  just has no minimum width to respect.
- Rows keep their own indentation, so a table inside a list still lines up
  under it.
- Tables inside a fenced code block are left alone — documentation of a
  table, not a table.
- `[diff] alignMarkdownTables = false` turns it off, and so does soft wrap
  (`zw`): padding is the widest cell in the table spent on every row, and
  wrapping breaks the column it was lining up anyway.

### P2 - The grid

Alignment cannot help a cell holding a paragraph, and a review table —
approaches against pros and cons — is all paragraphs. `gt` draws the table
under the cursor as a grid in an overlay:

- Cells wrap to their column; a row grows to its tallest cell.
- `<li>` becomes a bullet on its own line, with its continuation lines
  hanging under it — a list crammed into a cell is why these rows are long.
- The new side only: a deleted row belongs to the version being replaced,
  and mixing both into one grid would show a table that never existed.

The same renderer replaces OpenTUI's table rendering in comments and PR
descriptions, through `MarkdownRenderable`'s `renderNode` hook. Its own
gives each cell exactly one row and cuts the rest — silently, so a comment
with a table in it was losing most of its text.

## Technical Notes

### Display transform, not an edit

`alignMarkdownTables()` returns the rows whose *displayed* text should
change; `DiffLineMapping` applies them and moves the file's own text to
`sourceContent`. The invariant that makes this safe:

- **`content` is the truth for columns** — rendering, search, motions,
  flash and the cursor all measure against it, so they stay consistent
  with each other for free.
- **`sourceContent` is the truth for text** — `y` reads it, so the
  clipboard gets what the file says. `Y` was already reading `rawLine`.

Line count is untouched, so line numbers, hunks, folds and comment anchors
are unaffected. That is the whole reason this shape was chosen over
rendering.

### Detection

A block is two or more consecutive content lines in one markdown file
whose trimmed text starts with `|`. Requiring two avoids catching prose
that happens to begin with a pipe; not requiring a delimiter row means a
hunk that shows only the middle of a table still gets aligned.

Cells split on unescaped `|` only: GFM splits a cell even inside a code
span, and exempts `\|` alone.

Fences are tracked over the new side of the diff (a deleted fence marker
never opened the block that follows it). A hunk that *starts* inside a
fence cannot be detected, which is the accepted limit.

### File Structure

```
src/utils/markdown-tables.ts             # detection, splitting, padding
src/utils/markdown-table-render.ts       # the wrapping grid
src/vim-diff/line-mapping.ts             # applies the transform
src/vim-diff/types.ts                    # DiffLine.sourceContent
src/features/yank/handlers.ts            # yanks sourceContent
src/features/diff-view/table-peek.ts     # gt, from the diff's rows
src/components/TablePeek.ts              # the overlay
src/components/markdown-tables-in-markdown.ts  # comments and PR bodies
```
