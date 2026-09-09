# HTML in Comments

**Status**: Done

## Description

Comment bodies and PR descriptions render through OpenTUI's
`MarkdownRenderable`, which has no case for HTML tokens: whatever tags the
author wrote land in the panel verbatim. GitHub comments are full of them.
`<br>` is the only way to break a line inside a table cell, `<details>` is
how half of all PR descriptions hide their generated output, and the web UI
itself pastes `<b>`, `<a>` and `<img>`.

`comment-images.ts` already fought this for `<img>`, by lifting the tag out
and offering the URL to a browser. This does the same for the rest: the
handful of tags that carry meaning are translated into the markdown the
renderer does understand.

## Out of Scope

- A general HTML renderer. Tags with no obvious markdown equivalent are
  left alone rather than guessed at or silently dropped — a visible tag is
  better than missing text.
- Collapsing `<details>`. There is nothing to click in a terminal, so the
  body is simply shown with its summary as a heading.
- The diff. A comment body is prose to read; a markdown file in the diff
  is source under review, and rewriting it there would be rewriting the
  thing being reviewed.

## Capabilities

### P1 - MVP (implemented)

- `<br>` becomes a line break — or a `·` separator inside a table row,
  where a newline would end the row and strand the remaining cells.
- `<b>` / `<strong>`, `<i>` / `<em>`, `<code>` / `<kbd>` / `<samp>` become
  their markdown equivalents.
- `<a href="…">text</a>` becomes `[text](url)`.
- `<summary>` becomes a bold line; the `<details>` wrapper is dropped and
  the body follows it.
- Code spans and fenced blocks are untouched — there the tag is the text
  the author meant to write.
- Applied to comment bodies (inline overlay and comments panel) and to the
  PR description.

## Technical Notes

`softenCommentHtml()` maps only the segments outside code, using
`fencedRanges()` from `comment-images.ts` plus an inline-span scan, so a
body that documents `<br>` in backticks survives intact.

`<br>` is the one replacement that needs its context: `inTableRow()` looks
back to the start of the line to decide between a newline and the
separator.

The body is returned unchanged when it holds no `<` at all, which is the
common case.

### File Structure

```
src/utils/comment-html.ts             # the translation
src/utils/comment-html.test.ts
src/utils/comment-images.ts           # fencedRanges, now exported
src/components/InlineCommentOverlay.ts
src/components/PRInfoPanel.ts
```
