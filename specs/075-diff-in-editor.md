# Diff a File in the Editor

**Status**: Done

## Description

`ge` opens the file riff is showing, in its current state. The other thing a
reader wants an editor for is the change itself — the two versions side by
side, where the editor's own diff, folds and navigation apply. nvim does
this with `-d`; every editor does it somehow, which is why the command is
configuration rather than a constant.

## Out of Scope

- Editing the old side. It is a snapshot of a version that no longer
  exists; there is nowhere to write it back to.
- Choosing the editor per invocation. `$EDITOR` and one configured command
  is the whole of it.

## Capabilities

### P1

- `gd` opens both versions of the file the cursor is in, side by side, and
  blocks until the editor exits — riff comes back where it was.
- `gD` does the same in a tmux **pane** beside riff, so the diff that made
  you open the editor stays on screen. Outside tmux it says so.
- The new side is the working copy itself wherever riff can use it, so an
  edit made in the editor is an edit to the file. Where it cannot — a PR
  whose head is not checked out — both sides are snapshots and riff says the
  view is read-only.
- The command is configured:

```toml
[editor]
diff = "nvim -d {old} {new}"   # default
```

  `{old}` and `{new}` are each one argument, whatever is in them.

- While Claude has left a draft, `gd`/`gD` keep their spec 036 meaning —
  copy it, dismiss it — because the notification saying so is on screen.

## Technical Notes

The two versions come from the same place the context expansion gets them:
`getFileContent`/`getOldFileContent` in local mode, the PR head and base
blobs in PR mode. The old side is written to a temp file that keeps the
original extension, so the editor still highlights it, and is removed when
the editor exits — in the tmux case by the shell that ran it.
