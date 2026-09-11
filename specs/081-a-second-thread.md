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

- Threads on a line riff is not showing. A comment is anchored to a line in
  the diff; a second thread is a second comment on the same one.

## Capabilities

### P1

- Writing a comment starts a thread. `c` and `C` in the diff, `n` in the
  comments panel: all of them start one, on a line that already has one as
  much as on a line that has none. The composer says `New thread` where one
  already stands, so it is visible before anything is written.
- Replying is asked for: `r` in the comments panel, `R` for the same in
  `$EDITOR`. You open the thread and answer it — which is also how GitHub
  tells the two apart.
- The distinction survives publishing: a thread of its own is posted as a
  comment on the line, not as a reply to the thread above it.

## Technical Notes

The composer carries `replyToThread`, set where the composer is opened
rather than worked out when it is submitted — by then the only thing to go
on is the anchor, which both kinds share.
