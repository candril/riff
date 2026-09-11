# Flash Everywhere

**Status**: Done

## Description

`s` labels what you can see and jumps to the one you pick — in the diff.
Everywhere else you navigate by pressing `j` until you arrive: the file tree,
the info panel's sections and rows, the feed. The reflex should work wherever
there are rows on screen.

## Out of Scope

- Changing what `s` does in the diff.
- Labelling anything off screen. Flash is for what you can point at; `Ctrl-f`
  is for what you have to describe.

## Capabilities

### P1

- `s` works in the file tree, the info panel, the feed and the comments
  panel.
- In a list, `s` labels **every visible row at once** and the next keystroke
  jumps. There are rarely more than forty rows on screen, so a label each is
  enough and it costs one keypress.
- In the diff, `s` keeps today's behaviour — type, then pick a label — because
  labelling sixty rows of code is noise.
- Any key that is not a label cancels, leaving the surface as it was.
- Labels avoid the keys the surface would otherwise act on, so a mistyped
  jump never deletes a comment.

## Technical Notes

Flash currently reads `VimDiffView`'s visible rows directly. It should ask
whatever has focus instead:

```
FlashSurface
  targets()     → { id, screenRow, screenCol, text }[]   // what is on screen
  jumpTo(id)    → put the cursor there
```

The diff, the tree panel, the info panel, the feed and the comments panel
each implement two methods; `FlashHandler` loses its knowledge of the diff
entirely. This is the
same "focused surface" seam spec 064 introduces, so it lands after it.

The two flavours are one mechanism with different entry points: the list mode
skips straight to labelling, the diff mode labels after a search narrows the
candidates.
