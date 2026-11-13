# Usage Counts

**Status**: Done

**Not built**: P3

## Description

riff has close to a hundred palette actions and more keys than that, and
nobody knows which of them get used. riff counts, as you review, how often
each keymap command ran on a key and how often each action was picked from
the palette, and `riff usage` lists every palette action least used first, so
cutting an action can rest on weeks of use rather than on a hunch.

The counts stay on the machine: `~/.riff/usage.json`, one file for every
repo, holding names and totals and the time counting began. Never a file,
a review, a search, or the order of anything.

## Out of Scope

- Sending the counts anywhere
- Per-repo or per-day counts
- Counting the keys the tree's leftover and the text fields take, which run
  no keymap command

## Capabilities

### P1

- Every keymap binding that runs is counted under its command name
  (`bracket.nextFile`, `gchord.refresh`). A command that does something
  different on each of its keys is counted per key, spelled the way the
  registry's `shortcut` spells them: the diff's catch-all (`diff.key /`), the
  tree's (`tree.key H`) and `global.surface` (`i`, `a`, `d`).
- Every action picked from the palette list is counted under its id. A
  palette pick runs its command through `runCommand`, which the keymap does
  not report as a dispatch, so it is never also counted as its key.
- The counts are added to the file every 30 seconds, when the renderer is
  destroyed (Ctrl-c, the exit signals) and on process exit, each time re-read
  first so two riffs running at once both count. A save that fails is
  dropped without a word.
- `riff usage` prints every registry action with its key count, its palette
  count and what the key count was read off, least used first, then the
  commands run on a key that no action names. `--json` prints the same as
  JSON.
- An action the palette runs through a case of its own, whose key runs a
  command the registry does not name (`y` through `diff.key`, `go` through
  `gchord.openLink`), is counted off that command and key, from a table in
  the report. Where the key does more than the action (`Enter`, `Esc`,
  `go`), the report marks the count shared: an upper bound. A test fails
  when an action has a key the report cannot count, or the table names a
  command the keymap lacks.
- An action with neither a command nor a shortcut is palette-only: its key
  count is zero, not unknown.

### P3

- A way to switch the counting off

## Technical Notes

- `src/features/usage/counts.ts`: the counts, their merge, key spelling
- `src/features/usage/recorder.ts`: the in-memory tally and the keymap's
  `dispatch` listener, with a `key` intercept for the diff key's name
- `src/features/usage/index.ts`: `startUsageRecording`, wired in `app.ts`
  after the keys are built, so tests that build the keys never write the file
- `src/features/usage/report.ts`, `src/cli/usage.ts`: the report
- `src/storage/usage.ts`: the file, written to a temp file and renamed
- The palette's state factory carries the pick (`picked` / `onPick`), as the
  key context is wrapped in throwing proxies throughout the keys tests
