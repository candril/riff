# Comments on Files

**Status**: Done

## Description

Spec 084 draws a file and refuses to comment on it. That refusal was a
stopgap: the whole point of reading a repository in riff is to leave
something behind that Claude can act on, and a mode that shows you the code
and will not let you say anything about it is a pager.

The refusal was also older than file mode. `getCommentAnchor` returned
nothing for context expanded outside a hunk, because GitHub answers 422
there — so one `null` was carrying two different sentences: *riff has no
line here*, and *GitHub cannot anchor to this one*. Only the first is a
reason to have no anchor. The second is a note.

A note is a comment on a line riff is showing and GitHub cannot take. It is
stored where every other comment is stored, it reaches Claude through `riff
comments --json` like every other comment, and no publish path will touch
it.

## Out of Scope

- Publishing a note. It cannot be done. Pretending otherwise loses it.
- Re-anchoring a note whose line has moved. The hash that will answer that
  is written here; reading it is [086](./083-file-mode-plan.md)'s.
- A second store, a second format, or a second kind of thread.

## Capabilities

### P1

- `c`, `C` and the comments panel's `n` write on any line riff is showing —
  a file in file mode, context expanded outside a hunk, anywhere the cursor
  can sit on code.
- The composer says `Note … local only, never published` before anything is
  typed. Finding out at publish time is finding out too late.
- A note is stored as one: `kind: note` in the frontmatter, so the answer
  survives the round trip through `.riff/` — `publishableLocalComments`
  reads the comment and nothing else.
- Every publish path refuses it: the review, the single-comment push, the
  sync. A reply to a note is refused with it, because GitHub cannot anchor
  the thread either.
- A note shows only where riff has a row for it. The store is one
  repository's worth of notes and a diff is about a few files; the rest
  would be a panel full of remarks about elsewhere.

### P2

- The note carries a hash of its line as it read when it was written,
  trimmed so that reindenting does not invalidate it.

## Technical Notes

`hasRow` reads the hunk headers rather than a built `DiffLineMapping`, so
folding a file, filtering the tree or collapsing a block never makes a
comment vanish from the panel. In file mode the question is different — a
listed file has no hunks until it is opened (spec 084) — so being listed is
the whole of it there.

`CommentAnchor` carries `note`. That is the split: `getCommentAnchor`
returns `null` only where there is no line at all — a header, a divider, the
gap between files — and marks the anchor instead of withholding it wherever
GitHub is the one that cannot take it.

The kind and the hash were added by [091](./091-nvim-comments.md), which
needed exactly the bottom of this spec to write a comment from nvim.
