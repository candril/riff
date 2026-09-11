# Emoji by Shortcode

**Status**: Done

## Description

`:` and two letters is how a reviewer writes an emoji everywhere else. In
riff's composer it wrote a colon and a word, and the comment arrived on
GitHub saying `:tada` to nobody.

Type `:ro`, see the rocket, press Tab.

```
  ┌────────────────────────────────────────┐
  │  New comment @ limiter.ts:42           │
  │  ship it :roc                          │
  └────────────────────────────────────────┘
  ┌────────────────────────────────────────┐
  │ :emoji                                 │
  │ ▸ 🚀  :rocket:                         │
  │ ↑↓ nav  Tab/⏎ accept  Esc dismiss      │
  └────────────────────────────────────────┘
```

## Out of Scope

- Every emoji there is. The list is what a reviewer reaches for — approval,
  alarm, the thing that broke — because a picker you scroll is a picker you
  stop using.
- The PR-level comment box and the review summary. Both are other widgets;
  the composer is where comments are written.

## Capabilities

### P1

- A `:` that starts a word, with at least one character typed after it,
  opens the picker. A bare colon does not: prose is full of them.
- `↑`/`↓` or `Ctrl-p`/`Ctrl-n` move, `Tab` or `Enter` accepts, `Esc`
  dismisses and leaves what was typed. The mention picker's keys exactly —
  two pickers that behaved differently would be two things to remember.
- The query matches the shortcode it starts, then the one it appears in,
  then what the emoji means: `:lgtm` finds 👍, `:broken` finds 🐛.
- Accepting inserts the emoji itself rather than the shortcode. GitHub
  renders both; only one of them is legible in riff's own panel.
- `Enter` is still a newline while nothing matches, so a colon in prose
  never costs a keystroke.

## Technical Notes

`detectEmojiTrigger` mirrors `detectMentionTrigger`, runs in the same
composer activity callback, and needs nothing fetched — the list is
compiled in, so there is no loading state and no offline case.
