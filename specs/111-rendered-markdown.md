# Rendered Markdown

**Status**: In Progress

**Not built**: followable links, remembering the toggle for the review,
`Tab` for the old version, wrap rules, P2, P3

## Description

A markdown file in a review is read twice: once as source, to see what
changed, and once as the reader will see it, to judge whether it reads
well. riff already renders the pieces that are unreadable as source — tables
line up at display time ([053](./053-markdown-tables.md)) and `gl` draws a
mermaid block ([058](./058-mermaid-diagrams.md)) — but a whole document, a
README or a spec, is still reviewed as raw text.

`gR` on a markdown file shows it rendered in place of its diff: headings,
emphasis, lists and task lists, quotes, aligned tables, highlighted code
blocks, mermaid diagrams drawn inline, links. It is the same file, not a
preview window: every rendered block knows the source lines it came from,
so the cursor, comments, marks and jumps keep landing on real lines.

Tools like glow render markdown well in a terminal, but they print ANSI
with no way back to the source line, and they leave mermaid as a code
block. riff renders it itself, from the renderer the PR description and
the chat already use.

## Out of Scope

- **Editing.** The rendered view is read-only, like the diff.
- **HTML in markdown** beyond what the existing renderer already handles.
- **A separate preview window or pane.** The rendered file takes the diff's
  place for that file, and `gR` again brings the diff back.

## Capabilities

### P1 - The rendered file

- **`gR` toggles a markdown file** (`.md`, `.markdown`, `.mdx`) between its
  diff and its rendered new version, in single-file and all-files mode,
  per file. The file header says "rendered". The toggle is remembered for
  the review. In the side-by-side view the rendered file fills the new
  half; the old half stays empty.
- **What renders:**
  - headings (by level, in the theme's heading colours)
  - bold, italic, inline code, strikethrough
  - bullet, numbered and task lists
  - block quotes and rules
  - tables aligned as 053 does
  - fenced code blocks highlighted by their language
  - mermaid blocks drawn with 058's renderer, falling back to the source
    block when a diagram type isn't supported
  - links shown as their text, followable as 057 does
- **Lines stay lines.** Each rendered row maps back to a source line. `j`/`k`,
  search, flash, marks, `%`, the jumplist and `C` (comment) all work, and a
  comment made on a rendered row anchors to its source line. A row that
  exists only in rendering (a drawn diagram's row, a table rule) anchors to
  the first line of its block. A fenced block's fence lines are not drawn;
  its content lines are. A drawn diagram's rows all sit on the block's
  opening fence line, so a comment on the block's other lines has no row
  while the file is rendered. A rendered row outside the diff's hunks takes
  a note as an expanded line does ([085](./085-comments-on-files.md)).
- **`Tab` shows the old version** rendered the same way, as `gl` does, for a
  file that existed before.
- **Wrap** follows the view's width: prose wraps at word boundaries, while
  code blocks, tables and diagrams keep their lines and sidescroll.

### P2 - The rendered diff

- **Blocks carry the change:** a paragraph, list item, table row or code
  block that was added or changed gets the added tint, a removed one shows
  in the old version with the removed tint, and unchanged blocks stay
  neutral. A reviewer reads the document as it will be read and still sees
  what moved.

### P3 - Later

- **Images** inline where the terminal supports them ([021](./021-image-support.md)).
- **Folding by heading** (`za` on a heading folds its section).
- **A heading outline** in the file picker or a peek, to jump between sections.

## Technical Notes

- Parse with the markdown parser riff already uses for the PR description
  and the chat, and keep each block's source line range. The rendered rows
  are a row list like the diff's, so the windowed view, cursor and overlays
  apply unchanged.
- Tables and diagrams reuse `markdown-table-render.ts` and the mermaid
  renderer from 058.
- Code blocks are highlighted through the same tree-sitter path as the diff.
- Rendering happens per file on demand and is cached per file version.
