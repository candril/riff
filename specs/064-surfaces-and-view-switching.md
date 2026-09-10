# Surfaces & View Switching

**Status**: Done

## Description

riff will have three main views — the PR's **state** (the info panel), its
**feed** (what happened), and the **diff** — and they need one way of moving
between them, one place that decides who gets a keystroke, and a position
each that survives being left and come back to.

This is the refactor the rest of the plan stands on. It ships no new feature.

## Out of Scope

- The feed's content (spec 070). This spec gives it a key, a slot and a
  position; the view itself can be an empty box.
- Rewriting the modal capture chain (action menu, pickers, composer). They
  keep working exactly as they do; the router sits underneath them.
- Local mode. There is no PR to have a state or a feed, so `i` and `a` stay
  no-ops there and the diff is the only view.

## Capabilities

### P1

- `i` state, `a` feed, `d` diff, from any view.
- Pressing the key of the view you are already in returns you to the view you
  came from. One level of history, no stack to reason about.
- The landing view is the same every time: **state**, in PR mode. Never
  adaptive, never different on a second visit.
- Each view keeps its own position — the diff its cursor and scroll, the
  panel its section and row, the feed its row and filters — and finds it
  again when you come back.
- Global keys work from every view, routed to whatever has focus:
  `Ctrl-t` comments panel · `Ctrl-f` filter · `Ctrl-p` actions ·
  `Ctrl-b` file tree · `gr` refresh.
- While the comments panel or a composer has focus it keeps owning the
  keyboard, view keys included — `Ctrl-h` hands focus back. This is today's
  behaviour, stated so the router does not break it.

## Technical Notes

### The surface

```
Surface
  id            "diff" | "state" | "feed"
  position      saved on leave, restored on enter
  handleKey     keys that belong to this view
  flashTargets  the rows it can label (spec 066)
  filter        what Ctrl-f narrows here (spec 065)
```

`app/global-keys.ts` is a 1100-line chain of modal captures followed by a
switch. The router goes between the two: modals still capture first, then the
focused surface is asked, then the global switch. Nothing about the modals
changes.

### Why `a` and not `f`

`f{char}` is find-char in the diff and cannot move. `a` is free outside a
visual selection, reads as *activity*, and is one key from anywhere.

### View history

One slot, not a stack: `previousView`. Pressing `i` in state returns to
whatever set it. A stack would make `i i i` mean something nobody can predict.
