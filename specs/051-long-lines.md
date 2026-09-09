# Long Lines

**Status**: Done

## Description

A diff line wider than the pane was, in practice, unreadable past its right
edge. Nothing scrolled to it, nothing said it continued, and the only
control that acknowledged it — the horizontal scrollbar — took a row from
every file in the review to do so.

The fix is the one vim uses for `nowrap`: the view follows the cursor
sideways, the gutter stays put, and the lines that run off an edge say so.
Wrapping is available (`zw`) but not the default, because one row per line
is the shape a diff is scanned in.

## Out of Scope

- Rendering the diff as anything but source. A comment anchors to a line;
  anything that changes how many rows a line occupies has to keep that
  mapping intact, which is why wrapping is opt-in and why nothing here
  reflows content.
- Reformatting the source to fit (breaking long lines, eliding middles).
  The diff shows what is in the file.
- A split view, or a second pane for the same file.

## Capabilities

### P1 - MVP (implemented)

- **The content is as wide as its widest line.** Without this nothing else
  in this spec has anywhere to scroll — see Technical Notes.
- **Sidescroll**: the cursor reveal covers both axes, with 8 columns of
  lookahead (vim's `sidescrolloff`). `$`, `w`, `f{char}` and a search match
  past the right edge all bring their column into view.
- **No horizontal scrollbar.** One long line anywhere in the diff made the
  content wider than the viewport, so the bar was permanent — a row spent
  on a control nobody drags, in opentui's default grey.
- **The gutter stays pinned.** Line numbers, comment signs and file-header
  labels are repainted at the pane's left edge while scrolled sideways.
- **Overflow markers**: `›` in the last column of a line that continues,
  `‹` in the gutter's padding when content is scrolled off to the left.
- **Column readout**: the status bar shows `col 84/312` while the cursor is
  on a line wider than the window.

### P2 - Moving the view on its own

- `zl` / `zh` scroll one column, `zL` / `zH` half a screen, `zs` / `ze` put
  the cursor's column against the left or right edge. The cursor follows
  the scroll rather than being left off screen.
- `gl` peeks the cursor's whole line, wrapped and syntax-highlighted, in an
  overlay — or, on a markdown table row, the table it belongs to as a grid
  (spec 053) — the escape hatch for a line not worth scrolling through. The
  content is cut to the rows the window has, so a minified line cannot grow
  the box past the terminal.

### P3 - Wrapping

- `zw` soft-wraps the whole diff; `[diff] wrap = true` starts that way.
  Off by default. Breaks on words, since what is usually worth wrapping is
  prose, and marks each continuation row `↳` in the gutter's padding — the
  gutter draws a line number once per line, so without it a wrapped row
  reads as a new one. Markdown table padding is dropped while wrapping.

## Technical Notes

### Why scrolling did not work before

Yoga measures a `CodeRenderable` with `MeasureMode.AtMost`, and opentui's
measure function returns `min(available, natural)` — so the code was never
wider than the viewport, the scrollable content was never wider than the
window, and `scrollLeft` clamped a handful of columns from zero. Measured
on a 104-column line in a 60-column pane: content width 65, max scroll 5.

Passing the renderable an explicit `width` (the widest row of its content)
makes the width definite and skips that clamp: content width 110, and
column 80 becomes reachable. `VimDiffView.contentColumns` computes it; the
width is omitted while wrapping, where the clamp is exactly what is wanted.

`VimDiffView.width.test.ts` pins this down by mounting the real view in a
test renderer.

### The pinned gutter and the column window

Horizontal scroll translates the whole content, gutter included. Rather
than restructure the tree, the gutter is repainted over the pane's left
edge each frame from the line data the last build cached
(`renderGutterOverlay`).

This is not only cosmetic. What the repaint covers is exactly the columns
that have already scrolled past, which is what makes the visible window
`[scrollLeft, scrollLeft + width)` at every scroll position rather than
drifting by the gutter's width. `codeWindow()` and the cursor placement
both depend on that.

### Wrapping and the row map

Everything downstream assumed one mapping line is one visual row — the
cursor, the sticky header, flash, the vertical reveal. Wrapped, that stops
being true, so those paths go through a per-section `WrapIndex` built from
what opentui laid out:

- `lineSources[row]` gives the logical line a visual row belongs to
- `lineStarts[row]` gives the column of that line the row begins at
- the index is rebuilt on `line-info-change` (resize, content change)

With wrap off there is no index and every path takes the branch it always
took, which is what keeps the default safe.

Two spellings of that map are accepted: opentui 0.1.81 returns
`lineStarts` / `lineWidths`, newer builds `lineStartCols` / `lineWidthCols`.
`VimDiffView.wrap.test.ts` covers the index and the column lookup against
real output from both.

### Verification

The view has no interactive test harness, so the layout-sensitive parts
were checked by mounting `VimDiffView` in `@opentui/core/testing` and
reading back frames and cursor positions. That is what turned up the width
clamp above, and the two `lineInfo` spellings.

### File Structure

```
src/components/VimDiffView.ts      # geometry, overlays, wrap index
src/components/LinePeek.ts         # gl overlay
src/components/StatusBar.ts        # column readout
src/app.ts                         # ensureCursorVisible, both axes
src/app/global-keys.ts             # z-chords, gl
src/config/                        # [diff] wrap
```
