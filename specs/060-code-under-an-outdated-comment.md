# Code Under an Outdated Comment

**Status**: Done

## Description

A comment goes outdated when the lines it was written against have changed
since. GitHub greys it out and hides the code; riff kept the comment but had
nowhere to show what it was about — the diff shows the file as it is now, and
what the comment objected to is not in it any more.

`c` on a comment in the comments panel draws the code it was written against,
over the panel.

## Out of Scope

- Fetching anything. The hunk GitHub sends with every review comment is
  already in `Comment.diffHunk` and already stored with local comments; a
  comment that has none simply says so.
- A diff between then and now. That answers "what changed underneath this
  comment", which is a good question and a different feature — it needs the
  old blob as well as the hunk.
- Scrolling a hunk longer than the window. The end is kept, because that is
  the line the comment is anchored to, and the start is marked with `…`.

## Capabilities

### P1

- `c` on the highlighted comment shows its stored hunk, `@@` header and all,
  coloured as a diff.
- A reply borrows the hunk from the comment that opened the thread — GitHub
  only attaches one there, and it is what the whole conversation is about. The
  header says where it came from.
- The header names the file and line, and says outright when the thread is
  outdated: this is the code *as it was*, not as it is.
- `c`, `q` or `Esc` puts it away. While it is up it owns the keys, so `Ctrl-h`
  cannot leave a peek open over a panel that no longer has focus.
- A comment with no stored hunk toasts instead of opening an empty box, and
  the footer only advertises `c` when there is something to show.

## Technical Notes

The lookup is `features/inline-comment-overlay/hunk.ts`, pure and tested: a
comment, its thread root as a fallback, and nothing when neither carries a
hunk.

The peek is a modal over a modal — its key handling sits inside the panel's
input, after the focus gate and before the panel's own keys, which is what
makes it own the keyboard while it is open. Closing the panel clears it, so a
peek can never outlive the thing it was drawn over.

It also has to say so in `zIndex`: the comments panel is drawn at 50, and an
overlay without one is painted underneath it however late it is added to the
tree. The `gl` peeks get away with 0 because nothing they cover has a zIndex
at all.

GitHub truncates `diff_hunk` to a few lines of context ending at the commented
line, so what is shown is exactly what GitHub itself shows above an outdated
comment — no more, and no request to get it.
