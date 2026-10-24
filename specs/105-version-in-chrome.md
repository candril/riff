# The Version in the Header and the Help Overlay

**Status**: Done

## Description

To report which build broke, the user has to be able to name it without
leaving riff. riff shows its version where it can be read at a glance: at
the right end of the header and on the help overlay's title row.

## Out of Scope

- Checking for updates or comparing against a release.
- Any version text other than what `riff --version` prints.

## Capabilities

### P1

- **The header ends with the version**, dimmed (`overlay0`, the refresh
  time's colour), as `riff --version` names the build without the
  `riff ` prefix: `0.3.0+<sha>` for a compiled build, the tag alone for a
  release, `dev-<sha>` under `bun run`.
- **It is the first thing the header drops.** The version shows only while
  the padding, the left side, two cells of separation and the right side
  with the version all fit at their natural widths; otherwise it is dropped
  whole, never clipped to a fragment that names no build. It comes back on
  a resize that makes room, without a keypress.
- **The help overlay (`g?`) carries `riff <version>`** at the right of its
  title row.
- **The help overlay fits the screen.** Its two columns stand side by side
  only where both fit whole, the overlay then exactly as wide as their
  widest rows; otherwise every section stacks in one column, in the same
  order, which `j`/`k` scroll through to the last row. Below that column's
  own width the descriptions end in `…` at the overlay's edge. The overlay
  always leaves two cells of the screen on each side.

## Technical Notes

- `src/version.ts`: `RIFF_VERSION`, stamped by `scripts/build.ts`
  (`<package version>+<short commit>`, or the tag on a tag build), else
  `dev-<short commit>` from git.
- `src/components/header-fit.ts`: `versionFits`, measured in cells, since
  titles and filenames can hold wide glyphs.
- `src/components/Header.tsx` decides from the terminal's width, which is
  known before the first layout and follows every resize;
  `src/components/HelpOverlay.tsx` and `help-overlay-model.ts` draw the
  title row. Their frame models, in `src/app/frame-models.ts` and
  `src/app/overlay-models.ts`, hand both the version.
