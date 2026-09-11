# A Second Thread on One Line

**Status**: Done

## Description

A comment written on a line that already has one became a reply to it —
always, whichever key opened the composer. So the line where two separate
things are wrong could only ever hold one conversation about them, and the
second remark arrived inside the first thread, answering something nobody
had said.

GitHub files threads apart: a comment on a line starts one, and only an
explicit reply joins one. riff should be able to say both.

## Out of Scope

- Changing what `c` does in the diff. On a line with a thread it replies,
  and the composer says so — that is the common case, and the key has meant
  that for long enough to be muscle memory.

## Capabilities

### P1

- `n` in the comments panel starts a thread of its own on the diff cursor's
  line, even where one already stands. Its header says `New thread`, so the
  difference is visible before anything is written.
- `r` replies, as it did. The two keys sit next to each other in the
  panel's footer and now mean different things.
- The distinction survives publishing: a thread of its own is posted as a
  comment on the line, not as a reply to the thread above it.

## Technical Notes

The composer carries `newThread`, set where the composer is opened rather
than worked out when it is submitted — by then the only thing to go on is
the anchor, which both kinds share.
