# Demo Mode

**Status**: Done

## Description

`riff --demo` opens a review of a throwaway git repository riff generates
itself: a few small files with uncommitted edits over them, reviewed through
the ordinary local path. No network, no `gh`, no PR, and nothing written into
the user's own repositories.

riff is the only one of the five tools with no offline mode. The screenshots
and the README gif are recorded against a real private pull request
(`scripts/fixture.sh`), which means they cannot be re-recorded without access
to it, and the fleet's smoke harness — which proves a tool still paints a
frame after a dependency moves — can only check that riff prints its version.

## Out of Scope

- Faking GitHub. Demo mode is a **local** review; PR mode, the feed, checks
  and comment sync stay exactly as they are and are not reachable from it.
- Replacing `scripts/fixture.sh`. The recorded docs keep using the real PR
  until someone decides otherwise; this is about riff starting from nothing.
- A configurable fixture. One generated repo, the same every time.

## Capabilities

### P1 - Must Have

- `riff --demo` starts a local review with a real diff on screen and no
  network call, from any working directory, including one that is not a
  repository at all.
- The fixture is generated under `TMPDIR`, freshly, on every launch: a run
  that left drafts behind does not colour the next one.
- Comments written during the demo land in the fixture's own `.riff/`, never
  in the repository the user launched from.
- `--demo` appears in `--help` next to the targets.

### P2 - Should Have

- The diff is worth looking at: several files, an added file, a deleted one,
  and hunks far enough apart that scrolling and file switching have something
  to do.

## Technical Notes

`parseArgs` gains `demo`, which `main()` handles before anything else: it
builds the fixture, `process.chdir`s into it, and falls through to the
ordinary local path with no target — the same code `riff` with no arguments
runs. `providers/local.ts` probes `jj root` first and then `git rev-parse`,
so a plain `git init` fixture is picked up as a git working copy without a
special case.

Storage needs no confirmation: `resolveStorageDir` only asks when a GitHub
source has to be matched to a checkout, and `"local"` resolves straight to
the working copy's `.riff/`.

## File Structure

- `src/providers/demo.ts` — generates the fixture repo, returns its path
- `src/cli/args.ts` — the `--demo` flag
- `src/index.ts` — build, chdir, then the local path; help text
