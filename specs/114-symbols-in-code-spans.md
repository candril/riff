# Symbols in Code Spans

**Status**: Done

## Description

A review comment names code, and the name is already in the diff. Typing
`FancyViewController` by hand is how a comment ends up pointing at a class
that does not exist.

Open a backtick, type a letter or two, press Tab.

```
  ┌────────────────────────────────────────┐
  │  New comment @ limiter.ts:42           │
  │  rename `Fan                           │
  └────────────────────────────────────────┘
  ┌────────────────────────────────────────┐
  │ `symbol                                │
  │ ▸ FancyViewController                  │
  │ ↑↓ nav  Tab/⏎ accept  Esc dismiss      │
  └────────────────────────────────────────┘
```

## Out of Scope

- Knowing what a symbol is. An identifier regex works on every language and
  needs no parser to have loaded; tree-sitter would make the list depend on
  which files have been read.
- Context lines. They are what the change did not touch, and they would
  bury what it did.
- Fenced blocks. Inside a fence, and in a suggestion above all, the reviewer
  is writing code rather than naming it.
- Double-backtick spans and spans that cross a line.
- The PR-level comment box, the review summary and the chat: other widgets,
  as for the emoji picker.

## Capabilities

### P1

- A single backtick on the current line that no later backtick closes, with
  at least one character typed after it, opens the picker. A bare backtick
  does not: it is the first keystroke of every span and fence.
- The characters after the backtick are identifier characters, `.`, `/`, `:`
  or `-`. A space means the span is not one name, and closes the picker.
- `↑`/`↓` or `Ctrl-p`/`Ctrl-n` move, `Tab` or `Enter` accepts, `Esc`
  dismisses and leaves what was typed. The other pickers' keys exactly.
- Accepting replaces the span with `` `name` `` and leaves the cursor after
  it. A closing backtick already there is reused, not doubled.
- Typing the closing backtick dismisses the picker.
- With no match there is no picker at all, and every key is the composer's:
  a name the diff does not have yet is exactly what a rename comment types.
- Candidates are the identifiers on the diff's added and removed lines,
  removed ones because a comment often names what went away, and the changed
  files' paths and basenames. Keywords and anything under three characters
  are dropped.

### P2

- Equal matches rank the commented line's hunk first, then its file, then
  the changed files' paths, then the rest of the diff.
- The list follows the diff on screen: a commit scope narrows it.

## Technical Notes

`utils/diff-symbols.ts` holds the trigger and the candidates. Each file's
symbols are read once per `DiffFile` object, the list is memoised for one
diff and comment position, and it stops at 5000 candidates, closest first,
so a lockfile in the PR costs nothing while typing. The keymap asks whether
the picker is open several times per key, which is why the filtered matches
are memoised as well.

The picker's `open` answers false with no match, unlike the emoji and
mention pickers, which draw an empty message. An invisible picker that still
held Esc and the arrows would make the composer ignore them for no reason
the reader can see.
