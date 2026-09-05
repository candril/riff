---
title: Installation
description: Build riff, check the tools it leans on, and open your first diff.
---

riff is a [Bun](https://bun.sh) application that compiles to a single binary. There are no
prebuilt releases yet, so installing means cloning and building — which takes about as long as
`bun install` does.

## Build it

```sh
git clone https://github.com/candril/riff.git
cd riff
bun install
bun run build          # → dist/riff, a standalone binary
```

Put the binary somewhere on your `PATH`:

```sh
cp dist/riff ~/.local/bin/riff
```

With [just](https://github.com/casey/just), `just build` does the same thing, `just dev` runs
from source with hot reload, and `just run <target>` runs it once without building.

### Other platforms

The build script cross-compiles, which is what the release binaries will eventually come from:

```sh
bun run build:all             # macOS arm64 + x64, Linux x64
bun run build:macos-arm64     # or one at a time
bun run build:linux-x64
```

Each target writes `dist/riff-<os>-<arch>`.

## Requirements

- **[Bun](https://bun.sh)** 1.x — to build, and to run from source.
- **[`gh` CLI](https://cli.github.com/)**, authenticated (`gh auth login`), for everything
  GitHub: fetching PRs, posting comments, submitting reviews. riff shells out to `gh` rather
  than holding a token of its own, so it inherits whatever access you already granted it.
- **`git`** or **[`jj`](https://github.com/jj-vcs/jj)** for local diffs. Both are first-class;
  riff detects which one the repository uses.
- A terminal with truecolor and a decent Unicode set — WezTerm, Ghostty, kitty, iTerm2 and
  Alacritty are all fine. Syntax highlighting is Tree-sitter, so the colours matter.

Optional, and only for the actions that name them: `$EDITOR` (comment drafts, PR bodies, opening
files), `tmux` (`gF` opens a file in a new window), and `difftastic`, `delta` or `nvim` for the
external-diff actions in the command palette.

## Try it on something harmless

```sh
cd some-repo
riff
```

With no argument riff reviews your uncommitted changes — nothing is sent anywhere, comments stay
on disk, and you can learn the keymap on a diff you already understand. `Ctrl+p` lists every action
available right now with its shortcut, `g?` shows the keymap, `q` quits.

Then point it at a real PR:

```sh
riff pr        # the PR for the branch you're on
riff 123       # by number
```

:::caution
PR mode is not read-only. `gS` submits a review, `gs` pushes comment edits, replies and thread
resolutions, and `gP` rewrites the PR title and body — all as the account `gh` is logged in as.
Nothing leaves your machine until you press one of those, but they don't ask twice.
:::

## Files riff writes

| Path | What |
| --- | --- |
| `~/.config/riff/config.toml` | Your config. riff only reads this. |
| `<repo>/.riff/` | Draft comments, replies and review state for this repo. |
| `~/.riff/` | The same, when you're not inside a repository. |

Comments live next to the code they're about, in the repo, not in a global database — that is
what makes a half-finished review survive a reboot. Add `.riff/` to your global gitignore if you
don't want to see it in `git status`.

For a PR from a repo you're not currently in, riff looks for a local clone to store against,
using the [`storage`](/riff/reference/configuration/#storage) config. If it finds one by
guessing, it asks before using it.

## Next

[Getting Started](/riff/guide/getting-started/) walks a review from first diff to submitted
review.
