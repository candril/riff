# Following Links

**Status**: Done

## Description

A review is full of pointers out of the diff — `[ADR-017](../decisions/ADR-017-…​.md)`
in a changed doc, a `see src/app.ts:42` in a comment, a URL. `gf` follows the
one under the cursor: to the file's own rows when the diff is showing it, to
`$EDITOR` when it isn't, to a browser when it is a URL.

`gf` used to open the file being reviewed in `$EDITOR`. That is what vim's
`gf` means everywhere else, so it moves to `ge`, and the tmux variant with it.

| Key | Was | Is |
|---|---|---|
| `gf` | current file in `$EDITOR` | follow the link under the cursor |
| `gF` | current file in a tmux window | follow it into a tmux window |
| `ge` | — | current file in `$EDITOR` |
| `gE` | — | current file in a tmux window |
| `gx` | — | the URL under the cursor, in a browser |

## Out of Scope

- Following a link inside a comment or the PR overview. The cursor there is a
  highlighted row, not a column, so there is nothing to point at.
- Anchors. `…/adr.md#the-reason` opens the file; finding the heading inside it
  is left to the editor.
- Reference-style links (`[label][ref]`) and bare `www.` hosts.

## Capabilities

### P1

- `gf` follows a markdown link when the cursor is anywhere in it — the label
  included, which is where the cursor naturally lands.
- It follows a bare path too (`src/app.ts`), and takes a `:42` or `#L42`
  suffix as the line to land on.
- A target the diff is showing is opened **in riff**: the file is unfolded if
  it was marked viewed, the view jumps to it, and the jumplist records where
  you came from, so `Ctrl-o` comes back.
- A target the diff does not cover is opened in `$EDITOR` — the working copy's
  file where there is one, a read-only snapshot of the PR head otherwise.
- `gF` skips the in-riff jump and always opens a tmux window: the point of
  asking for another window is to have both.
- `gx` opens a URL in the browser; `gf` on a URL does the same rather than
  nothing.
- Nothing under the cursor says so and does nothing else.

## Technical Notes

### Which path a link means

Two conventions collide in a diff. A markdown link is relative to the file it
is written in, so `../decisions/x.md` inside `docs/guides/import.md` resolves
under `docs/`. A path in prose — `see src/app.ts` — is almost always from the
repo root.

Rather than guess from the syntax, `resolveCandidates` returns both readings,
most-likely first, and the caller picks the one that exists: the diff is asked
first, then the working copy. An explicit `./`, `../` or leading `/` has only
one reading and returns one candidate.

### Finding the link

`linkAt(text, col)` reads the rendered row, so it sees what the reviewer sees.
It looks for a markdown link covering the column first, then a bare URL, then
the whitespace-delimited word — which must look like a path (a `/` or a file
extension) before it counts, or `gf` on prose would go hunting for a file
called "the".

Trailing sentence punctuation is trimmed: `changed in src/app.ts, then…` links
to `src/app.ts`, not to `src/app.ts,`.
