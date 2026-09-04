# Flash Navigation

**Status**: Done

## Description

flash.nvim-style jump navigation for quick cursor positioning, matching the
behaviour of `require("flash").jump()` with flash.nvim's defaults.

Press `s` in the diff view to enter flash mode. The diff dims. Every character
typed narrows a literal, bidirectional search over the code that is currently on
screen, and each match is labelled with a single home-row key drawn over the
match's first character. Pressing that key jumps the cursor there and leaves
flash mode.

This is a faster alternative to incremental search (`/`) when the target is
already visible — you type the search characters and the jump label in one
motion, instead of typing a pattern and then walking `n`/`N`.

## Out of Scope

- Treesitter-aware jumps (function/class boundaries)
- Remote actions (delete/yank to a flash target without moving)
- Multi-window jumps
- Operator-pending mode integration (e.g. `ds{flash}`)
- Search history for flash patterns
- Continuing a flash search after a jump

## Capabilities

### P1 - MVP (implemented)

**Flash mode activation:**
- `s` in the diff view enters flash mode. `S` is unchanged (submit comment).
- `Esc`, `Ctrl+c`, or `Enter` leaves flash mode without moving.
- Flash captures every key while active, so a stray motion cannot fire
  half-way through a jump.

**Search input:**
- Bidirectional, over the visible viewport only — the same scope flash.nvim
  searches, and the reason a single-character label alphabet is enough.
- Incremental: matches and labels update on every keystroke.
- Literal, case-insensitive matching, consistent with riff's `/` search.
- Only code lines (context / addition / deletion) are searched; file headers
  and fold markers are not jump targets.
- Backspace un-types a character; backspace on an empty pattern exits.

**Visual feedback:**
- The diff content dims towards its own background — the add/delete tinting
  stays legible underneath, and the line-number gutter is left alone.
- Matches are lifted back out of the backdrop with a highlight.
- Each labelled match shows its key over the match's first character — the
  cell the cursor will land on — bold on a red background. This is the one
  deliberate departure from flash.nvim, which places the label one column
  past the match (`label.after`); pointing at the landing cell reads better.

**Jump execution:**
- Pressing a label jumps to the start of that match. Uppercase is accepted
  for a lowercase label (flash.nvim's `label.uppercase`).
- No autojump: a single match still needs its label pressed, matching
  flash.nvim's `jump.autojump = false`.
- The pre-jump position is pushed onto the jumplist, so `Ctrl-o` comes back
  (`jump.jumplist = true`).

**Labels:**
- Alphabet is flash.nvim's default `asdfghjklqwertyuiopzxcvbnm` — home row
  first.
- Assigned closest-to-cursor first (`label.distance = true`), tie-broken on
  column distance.
- A key that could also *continue* the search is dropped from the alphabet:
  pressing it would have to mean both "jump there" and "narrow the pattern",
  so typing always narrows and a label always jumps.
- More matches than labels leaves the surplus highlighted but unlabelled,
  rather than falling back to two-character labels.

**Prompt:**
- A `flash <pattern> (n targets)` line in the same slot as the search prompt;
  the two modes are mutually exclusive.

### P2 / P3 - Not implemented

Configurable alphabet and label position, line/word jump modes (`gs`/`gw`),
visual-mode extension, `.` repeat, and direction-annotated labels.

## Technical Notes

### File structure

```
src/
  vim-diff/
    flash-state.ts          # FlashState/FlashMatch, label assignment (pure)
    flash-state.test.ts
    flash-handler.ts        # FlashHandler: pattern, matches, jump
    flash-handler.test.ts
  features/
    flash/
      input.ts              # Key capture while flash is active
  components/
    FlashPrompt.ts          # Bottom prompt line
    VimDiffView.ts          # Backdrop + label overlay, visible-region query
```

### Rendering

Labels and the backdrop are drawn straight onto the frame buffer from the
diff view's post-process pass — the same pass that already positions the
terminal cursor, so both resolve the viewport identically.

Overlaying beats restyling the content: no rebuild, no re-highlight, and a
label can sit on top of a character without shifting the columns the cursor
is measured against. `VimDiffView.visibleRows()` walks the on-screen rows
once, mapping each back to its visual line and to the terminal cell where
that line's content starts. `getVisibleRegion()` exposes the same walk to
`FlashHandler`, which is what confines the search to what the user can see.

That content column comes from the CodeRenderable's laid-out `.x`
(`contentOriginX`), not from re-deriving the gutter width. The gutter is
per-file in all-files mode and OpenTUI sizes it from the renderable's own
`virtualLineCount` and sign widths, which riff can only approximate — and
when the approximation drifts, every column on screen drifts with it,
cursor included. `.x` is absolute and already carries the horizontal scroll
translate, so adding `scrollLeft` back recovers the unscrolled origin. The
old formula survives only as a fallback for frames before layout settles.

The backdrop fades each cell's foreground towards its own background rather
than painting a flat colour over the region, which is what keeps the diff's
add/delete tinting readable while dimmed.
