# Recent Reviews

**Status**: Done

**Not built**: P2

## Description

Once a riff quits, nothing remembers what it reviewed: a PR opened from a
link yesterday is a search through GitHub today, and a local review of
another workspace is a command to retype. riff keeps a list of the reviews
it opened, newest first, in `~/.riff/recent.json`, and `riff recent` prints
it, so riff's own screens and the tools around it (a launcher, a tmux
picker) can offer the way back.

## Out of Scope

- Where in a review you were: the file, the cursor, the open panels
- Per-repo lists: one file, wherever riff ran
- Syncing the list anywhere

## Capabilities

### P1

- Every review riff opens goes to the top of the list once the app starts:
  a PR with its URL, owner, repo, number and title; a local review with the
  target as typed (a revision, `<workspace>@`, a path) or null for the
  working copy. Both carry the directory riff ran in and when it opened.
- The same review opened again replaces its entry: a PR by its URL, a local
  review by its directory and target.
- Quitting marks the entry closed (`closedAt`), on `q` and on Ctrl-c and the
  exit signals. A riff killed outright stays unmarked.
- The list keeps the newest 200. Each write re-reads the file and renames a
  temp file into place, so riffs running side by side all land and a reader
  never sees half a file. A write that fails is dropped without a word.
- The demo is never recorded: its repository is rebuilt in a new temporary
  directory every run.
- `riff recent` prints the list, `*` marking reviews still open; `--json`
  prints the entries as stored.

### P2

- The screen for a `riff` with nothing to review (spec 112) offers the
  recent reviews alongside the clipboard and typed references

## Technical Notes

- `src/storage/recent.ts`: the file, `recentKey`, `recordOpened`,
  `recordClosed`
- `src/features/recent/index.ts`: what a started app records
  (`recentReviewFor`), wired in `app.ts` next to the usage counts, so no test
  that builds the keys writes the file
- `src/cli/recent.ts`: `riff recent`
- The file is `{ "reviews": [...] }`, so later fields can join the entries
  and the top level without breaking a reader
