# Visual Selection & Text Objects

**Status**: Done

## Description

Charwise visual mode in the diff. `v` starts a selection that grows by
character with every motion the view already has, `y` yanks exactly what is
highlighted, and `i`/`a` inside a selection grab a text object — a word, a
quoted string, a bracket pair, or one of the diff's own structures: a hunk, a
file, a run of added or deleted lines.

`v` was "mark file viewed". That moves to `x` — one key, because it is pressed
constantly, and the same key GitHub's own review checkbox suggests.

## Out of Scope

- Operator-pending motions (`yiw`, `y3j`, `d`, `c`). `y` yanks the current line
  the moment it is pressed (spec 047); making it wait for a second key would
  break that for `yy`, and there is nothing to delete or change in a viewer.
  Select first, then yank.
- `gv` to reselect. The binding is deliberately left free for it.
- Counts (`3iw`), named registers, block-visual (`Ctrl-v`).
- Text objects in the tree, the comments panel or the PR overview.

## Capabilities

### P1 - MVP

- `x` toggles viewed, in the diff and in the tree, replacing `v`.
- `v` enters charwise visual mode; `V` still enters visual-line. Either key
  switches to the other mode while a selection is live, and repeating the
  current one leaves visual mode, as vim does.
- `o` jumps to the other end of the selection.
- Every existing motion extends the selection: `h l w b e 0 ^ $ f t ; ,` and
  the vertical ones.
- The selection is painted over the rendered rows, so it follows soft wrap,
  sidescroll and syntax colors.
- `y` yanks the selected characters; a multi-line charwise selection yanks
  the tail of the first row, the whole middle, the head of the last. `Y` has
  no charwise meaning — it falls back to the touched rows with their gutter.
- Everything that reads a selection — comment anchors, permalinks, the AI
  review scope — sees the charwise selection's line span, which is what a
  GitHub anchor can express anyway.
- The status bar names the mode and the size of the selection.

### P2 - Text objects

`i` (inner) or `a` (around) inside a visual selection, then:

| Key | Object |
|---|---|
| `w` / `W` | word / WORD |
| `"` `'` `` ` `` | quoted string |
| `(` `)` `b` | parentheses |
| `{` `}` `B` | braces |
| `[` `]` | brackets |
| `<` `>` | angle brackets |
| `h` | the hunk under the cursor |
| `f` | the current file's rows |
| `+` / `-` | the run of added / deleted rows |

- Word and quote objects resolve within one rendered row.
- Bracket objects are **side-aware**: they walk only the rows belonging to the
  version the cursor is on, so a `{` on a deleted line never pairs with a `}`
  on an added one.
- `h`, `f`, `+` and `-` are linewise and switch the selection to visual-line.
- An object that cannot be resolved leaves the selection untouched.

### P3 - Later

- `gv` to reselect the previous selection.
- `ip`/`ap` (paragraph), `it`/`at` (tag).
- Resolving bracket objects against the file's full text rather than the
  rendered rows, so a partner hidden behind an unexpanded divider is found.

## Technical Notes

### Selection state

`VimMode` gains `"visual"`. `selectionAnchor` stays the anchor **line** for
both visual modes, so every existing consumer (`getSelectionRange`, comment
anchors, permalinks, the AI review scope) keeps working against a charwise
selection without knowing about it; `selectionAnchorCol` carries the column
and is read only through `getCharSelection`.

Callers that meant "any visual mode" use `isVisualMode` rather than comparing
against `"visual-line"`.

### Painting the selection

Drawn straight onto the frame buffer in the post-process pass, next to the
flash overlay, using each `VisibleRow`'s `startCol`/`endCol` window.

The alternative — injecting ranges through `CodeRenderable.onHighlight`, the
way search does — is wrong here. Assigning `onHighlight` marks the highlights
dirty, and a re-highlight is a full async tree-sitter re-parse of the whole
section. Search pays that on each new pattern; a selection would pay it on
every keystroke of `l`.

### Text objects

`vim-diff/text-objects.ts` is pure: mapping + line + col + scope + key in, a
charwise or linewise span out. The pending `i`/`a` lives in `VimCursorState`
next to `pendingFindChar`, and is resolved in `VimMotionHandler`.

`i` toggles the PR overview globally, so the global handler has to leave it
alone while the diff is in visual mode, and the pending object is captured
before the single-key handlers — otherwise `vi{`'s `i` would flip the view
and `if`'s `f` would be eaten by the file picker.

### Yank

Charwise yank slices `DiffLine.content` — what is on screen. Where the
markdown table alignment padded the cells (spec 053), that padding is what
gets copied; only linewise yank can honour `sourceContent`, because character
offsets into a padded row do not map back to the source.

Structural rows (file headers, dividers, spacing, `\ No newline`) are skipped
by the same `SKIPPED_TYPES` filter as before, so a selection dragged across a
file boundary still yields only code.
