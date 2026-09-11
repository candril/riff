# Suggestions

**Status**: Done

## Description

The shortest review comment is the edit itself. GitHub reads a
```` ```suggestion ```` block as a replacement for the lines the comment is
anchored to, and the reader can apply it with one click — but writing one by
hand means retyping the code you are looking at, inside a fence, without
getting the indentation wrong.

riff has the lines. It should type them for you.

## Out of Scope

- Applying a suggestion. riff reviews; GitHub's merge button applies.
- Suggesting across files, or across a hunk boundary. A suggestion replaces
  a contiguous run of one file's lines, which is what GitHub accepts.

## Capabilities

### P1

- `Ctrl-y` in the comment composer inserts a suggestion block at the cursor,
  prefilled with the lines the comment replaces, as they read now. You edit
  them in place; the fence is already right.
- A comment written on a **selection** covers that whole block: it is
  anchored to the selection's last commentable line and carries the first,
  which is how GitHub's review API spells a multi-line comment. The
  suggestion then replaces exactly the lines that were selected.
- The range survives being saved, re-read and published — as a single
  comment, in a batched review, and through the sync of a local one.
- On a comment riff cannot read lines for, `Ctrl-y` says so rather than
  inserting an empty fence, which GitHub would read as "delete these lines".

## Technical Notes

`Comment` grows `startLine`, written into the comment file's frontmatter and
sent as `start_line` / `start_side` wherever a comment reaches GitHub. Both
review-submission paths went through their own object literal; they share
one now, so a range cannot be supported in one and dropped in the other.

The lines come from the diff rows themselves rather than from the file on
disk — `sourceContent`, so an aligned markdown table contributes its own
text and not its padding.
