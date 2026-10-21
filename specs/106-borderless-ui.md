# Borderless UI

**Status**: Done — the help overlay, the peeks and the confirm dialog stand on `base` over a dimmed screen rather than on `mantle`

## Description

riff separates its surfaces by background shade, not by box-drawing lines,
the way ../lane does. Frames cost a cell on every side, draw a grid of
lines the eye has to read past, and in a terminal they are the loudest
thing on screen. Three shades from the Catppuccin theme say the same
thing calmly: what is content, what surrounds it, and where you type.

## Out of Scope

- A theme system or other palettes. The shades are Catppuccin Mocha's.
- The diff's own tints. Added, removed, word marks and the cursor line
  stay as they are.

## Capabilities

### P1

- **No borders anywhere.** Panels, inputs, pickers, overlays and
  notifications separate by background.
- **Exactly three levels, and no more:**
  1. `base` (#1e1e2e): the content, i.e. the diff and the PR description.
  2. `mantle` (#181825): everything around it. That's the file tree, the
     thread panel, the chat column, header, status bar, pickers, modals
     and toasts.
  3. `surface0` (#313244): the places you type into (comment composer,
     prompts, filters, the chat input) and the selected row of a list.
- **Focus shows by shade or title colour**: the shade of the focused
  panel's input, or a coloured title text, never a frame.
- **Diff tints stay** as they are.
- **One cell of padding** replaces the inset a border used to give.
- **Calm**: no new colours, no fourth level, no stripes. Every new
  component follows the rule from the start, and its frame tests read
  backgrounds rather than frame glyphs.

## Technical Notes

- The tokens are `theme.base`, `theme.mantle` and `theme.surface0` in
  `src/theme.ts`; `colors.headerBg` and `colors.statusBarBg` are `mantle`.
  `colors.border` (`surface1`) is left in the theme, and no component
  draws a border with it.
- Frame tests check shades with `bgAt` and `fgAt` from
  `src/testing/frame.ts`.
