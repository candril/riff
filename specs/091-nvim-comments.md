# Comments From nvim

**Status**: Draft

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

## Open questions

- What writes the file — Lua, or `riff comments add --file --line` with the
  plugin shelling out? A CLI writer keeps one implementation of the format
  and makes the plugin trivial; it also costs a process per comment, which
  at human typing speed is nothing. This looks like the answer.
- Which comments does virtual text show: local notes only, or synced GitHub
  threads too? The second needs riff to have fetched them, which makes the
  plugin depend on a review having been opened.
- Does resolving from nvim make sense, or is retiring a comment something
  the agent and riff do?
- Anchoring. A comment written in nvim is written against the working copy,
  which is exactly the drift problem 083 already decided: fingerprint the
  line, re-anchor in a window, go stale out loud. The plugin inherits that
  rather than inventing anything.

## Technical Notes

Depends on 085 for the note kind — a comment written in nvim against
unchanged code is the same thing as one written in riff's file mode, and it
must be unpublishable in the same way and for the same reason.
