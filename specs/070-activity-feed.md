# Activity Feed

**Status**: Ready

## Description

The overview says what a PR *is*. The other question — what *happened*, and
what happened since I left — has no home: the Conversation section knows
about comments and nothing else, so commits, approvals, resolutions, checks
turning green and force-pushes are invisible unless you go to the browser.

`a` opens the feed: one row per event, newest first, filterable by type.

## Out of Scope

- Local mode. Commits without a PR are the diff's business.
- Replying, approving or resolving from the feed. It is a way in, not a
  second comments panel; `Enter` takes you where the action lives.
- Streaming. The feed refreshes when riff does.

## Capabilities

### P1

```
  Feed          42 events · all types                        ● 5 unseen
  [1] commits  [2] comments  [3] reviews  [4] checks  [5] threads  [0] all  [u] unseen
 ────────────────────────────────────────────────────────────────────────────────────
   20m     review    @carol   approved
   40m     check     CI / test                        ✓ passing  (was failing)
    1h     resolved  @bob     "naming"  · 3 replies
    1h  ●  comment   @alice   parser.ts:88  "this drops the last line"
    2h  ●  commit    a3f2c19  fix: handle empty hunks          4 files  +38 −12
                     ├ src/parser.ts                                   +30 −4
                     └ src/parser.test.ts                               +8 −8
    3h     push      force-pushed · 3 commits replaced
```

- Row types: commit, comment, review, thread resolved, check run, push and
  force-push, ready-for-review. Title and description edits are collected but
  off by default.
- Number keys toggle types, `0` returns to all, `u` narrows to unseen
  (spec 069), `Ctrl-f` filters by text (spec 065).
- `za` expands a commit into its file list with per-file `+/−`. The files are
  fetched when the row is expanded, not on arrival.
- `Enter` opens what the row is about: a commit → the diff scoped to it, a
  comment → its thread, a check → its annotations, a review → its comments, a
  push → the range it replaced.
- `a` returns from the diff to the feed with the same row still selected.
- `s` labels the rows (spec 066).

## Technical Notes

### Where the events come from

`GET /repos/{owner}/{repo}/issues/{number}/timeline` — commits, reviews,
review threads, force-pushes, renames, ready-for-review, labels — in one
paginated call. It is the only source that reports a force-push at all, which
is why it is worth a request riff does not make today.

Check runs come from the check suites riff already fetches and are merged into
the same stream by timestamp. Review comments riff already has.

### Scoping a commit into the diff

Nothing new: `viewingCommit` already re-filters the whole diff view to a
single commit, and `]g` / `[g` walk them. `Enter` sets it and switches views,
and the diff's header says which commit it is showing and how to get back.

### Position

The feed keeps its own row, expansion and filter state across view switches
and refreshes, like every other surface (specs 063, 064).
