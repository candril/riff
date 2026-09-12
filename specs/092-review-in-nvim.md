# The Review, In nvim

**Status**: Done

## Description

Spec 091 put your own notes in the editor. The other half of a review is
what someone else said, and that lived only in riff — so answering "why is
this line like that" meant leaving the file to go and look.

The comments are already on disk: riff writes a pull request's threads to
`.riff/comments/gh-owner-repo-N/` whenever it opens one, with the author,
the hunk they were written against and GitHub's own view of whether the
anchor still holds. Nothing needed fetching that riff could not already
fetch. What was missing was a way to ask for it without opening riff, and a
way to know where those lines are now.

## The line nvim does not cross

**The editor makes no network calls of its own, and none behind your back.**
`riff comments fetch` is riff fetching, on a keypress. Nothing polls,
nothing refreshes on `BufReadPost`, and a review appears because you asked
for it and goes away when you say so.

## Out of Scope

- Writing a review comment from nvim. It would have to be published, and a
  comment written outside a diff cannot be (spec 085). Notes are what nvim
  writes.
- Resolving a thread from nvim.
- Showing a review riff has never fetched. `:RiffPr` fetches first, so this
  is a distinction without a difference — but nothing else does.

## Capabilities

### P1

- `riff comments fetch [<target>]` pulls a pull request's comments into
  `.riff/` and prints the same report `list` does. With no target it is the
  pull request for the current bookmark or branch; without one it says which
  it looked under and stops.
- `riff comments --synced` includes the review's own comments in the
  listing and the payload, which otherwise carry only what riff wrote.
- Every thread says its `author`, the `commit` it was written against,
  whether that is the worktree's `head`, GitHub's `outdated`, and its `url`.
- `:RiffPr` fetches and draws the review on the file, in its own sign and
  its own layer. `:RiffPrHide` puts it away without touching your notes.
- A comment whose line has moved is drawn where the line is now. One whose
  line is gone is not drawn at all, and the count of them is said out loud —
  a review comment on code that has since changed is worth knowing about and
  worth not pointing at.

## Technical Notes

A review comment carries no anchor hash — riff did not write it — but it
carries the hunk GitHub sends with it, and **that hunk ends at the commented
line**. Not at the line its own header advertises: GitHub sends the context
leading up to the comment, so counting down from `@@ -0,0 +1,48 @@` never
reaches line 17. The last content row of the hunk is the line, hashed, and
from there it is spec 086's drift search.

`onHead` is in the payload and is not what decides anything. Under jj the
working copy is always a fresh change on top of the branch, so a worktree is
essentially never *on* the commit a comment was written against, and gating
on that would hide every review comment always.

Two extmark namespaces, because showing and hiding a review must never
disturb the notes you wrote.
