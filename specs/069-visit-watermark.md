# Visit Watermark

**Status**: Ready

## Description

riff has no memory of when you last looked at a PR, so it cannot tell you
what arrived since. Everything downstream of that question — unread markers,
jumping to new comments, a feed scoped to "since I left" — needs one small
record, and nothing else.

## Out of Scope

- Local mode. There is no PR to have visited.
- Marking things read on GitHub. This is riff's own memory of your reading,
  not a sync.
- An unbounded history. One watermark per PR, not a log of visits.

## Capabilities

### P1

- Per PR, riff remembers: when you last had it open, the head SHA it was at,
  and the ids of comments you had seen.
- A comment counts as **seen** when it has been on screen in the comments
  panel or the info panel, or when you jumped to it. Opening the PR does not
  mark everything read — that would make the feature useless on the first
  keystroke.
- Unseen comments are marked wherever they appear: a dot on the file's row in
  the tree, on the thread in the panel, on the row in the feed.
- `]n` / `[n` jump to the next and previous unseen comment, across files, the
  same way `]r` / `[r` walk threads.
- Files whose content changed since the watermark's SHA are marked in the
  tree — the same comparison `]o` already makes against `viewedAtCommit`.
- When the old head SHA is no longer an ancestor of the new one, riff says
  **rebased** and falls back to timestamps rather than claiming that forty
  files changed.

## Technical Notes

Stored in `.riff/` beside the viewed statuses, keyed by PR:

```
{ "lastVisitAt": "…", "lastSeenHeadSha": "…", "seenCommentIds": ["…"] }
```

`seenCommentIds` only needs the ids created after `lastVisitAt` — everything
older is seen by definition — so the list stays small however long the PR
lives.

The file-staleness half already exists: `FileReviewStatus.viewedAtCommit` and
the outdated-file navigation (`]o` / `[o`) do this comparison today for
viewed files. This widens it from "files you marked viewed" to "everything,
since your last visit".

The watermark is written when riff exits and when the PR is refreshed, not
continuously: the question is "since I last looked", and a live-updating
watermark answers "since a moment ago", which is never useful.
