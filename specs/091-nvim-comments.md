# Comments From nvim

**Status**: Done

## Description

riff's loop is: a comment lands in `.riff/`, `riff comments --json` hands it
to Claude, `riff comments resolve` retires it. Nothing in that loop requires
riff to be the thing that wrote the comment — `.riff/` is markdown with
frontmatter, anchored to a file and a line.

So: an nvim plugin that writes one. `<leader>rc` on a line opens a buffer,
writing it saves a riff comment exactly as riff would have; virtual text
marks every line that carries one. The agent picks them up without knowing
or caring which editor typed them.

The gain is navigation riff will never have. LSP, treesitter motions, marks,
harpoon, whatever the reader already has — all of it, over the whole
codebase, with a way to say "this bit, here" that ends up in the same queue.

Not a primary feature. riff stays the place a review is read.

## How this sits with spec 083

[The file-mode plan](./083-file-mode-plan.md) rejects "an nvim plugin", and
the reason is specific: riff's mermaid and table rendering is entangled with
the diff model, and ported to Lua it forks the codebase across two runtimes
for a preview several plugins already do.

None of that applies here. This plugin renders nothing. It writes a file
format and draws virtual text, and it is a few hundred lines of Lua that
never needs to know what a hunk is.

## Out of Scope

- Rendering a diff, a table or a mermaid diagram in nvim. That is the thing
  083 said no to, and it still says no.
- Publishing to GitHub from nvim. A comment on unchanged code cannot be
  published at all (085), and one that can is riff's job.
- Reimplementing the comment store. The plugin writes the format; riff and
  `riff comments` own what it means.

## Capabilities

### P1

- `riff comments add --file <path> --line <n> [--end-line <m>]` writes a
  comment from outside riff, body on stdin. riff owns the format: which
  `.riff/` a comment belongs in is six rules deep, and a second
  implementation would write where riff does not read.
- What it writes is a note. The writer has no diff in view and cannot know
  whether GitHub could anchor the line, so riff answers the honest way —
  `kind: note` in the frontmatter, and `publishableLocalComments` refuses
  it. A 422 at the API loses the note; this does not.
- `<leader>rc` opens a markdown buffer in a float — `:w` saves, `q`
  abandons. A buffer and not `vim.ui.input`, because a review comment is a
  paragraph more often than a sentence and everything you know about editing
  one should still work. A visual selection comments on the range.
- A commented line carries the start of the comment beside it, cut off at
  the width with an ellipsis, and `+N` where a line holds more than one.
- `<leader>ro` opens riff on the current file — 083's twenty-line editor
  command, which is where it belongs.

### P2

- The comment stores a hash of the line it was written on, trimmed, so
  reindenting does not invalidate a note. Re-anchoring against it is 085's.
- Reading is asked for, never watched: on buffer read, after a write, or on
  `:RiffRefresh`. Never blocking — this runs on every `BufReadPost`, and an
  editor that stops for a subprocess when you open a file is worse than no
  marks — and riff's answer is reused for two seconds, so opening a
  directory is one subprocess rather than one per file.

## Not here

- Virtual text for synced GitHub threads. It needs riff to have fetched a
  PR, which would make what nvim draws depend on whether a review was opened
  somewhere else. Worth doing; not first.
- Resolving from nvim. An agent retires a note, and riff is where a review
  is read.

## Technical Notes

The note kind is the bottom of 085 brought forward: `publishableLocalComments`
reads the comment and nothing else, so "this can never be published" has to
survive the round trip through `.riff/`. 085 builds riff's own composer on
the same field.

The composer buffer is `acwrite`, not the `nofile` a scratch buffer starts
as — `:w` refuses a `nofile` buffer outright (E382) and `BufWriteCmd` never
runs.
