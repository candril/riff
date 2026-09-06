---
title: Installation
description: Install riff, check the tools it leans on, and open your first diff.
---

## Install

Prebuilt binaries for macOS (Apple Silicon and Intel) and Linux (x64 and arm64), by any of three
routes. All three install the same binary: the one attached to the latest
[release](https://github.com/candril/riff/releases), verified against its `SHA256SUMS`.

### Homebrew

```sh
brew install candril/tap/riff
```

The tap is [candril/homebrew-tap](https://github.com/candril/homebrew-tap); `brew upgrade` picks
up new releases.

### Nix

```sh
nix run github:candril/riff                 # run it once
nix profile install github:candril/riff     # keep it
```

Or as a flake input — `inputs.riff.url = "github:candril/riff"`, then
`inputs.riff.packages.${system}.default`. The flake packages the release binary; the release
workflow writes its `release.json`, so `nix run` and `nix flake update` land on the newest release.

The package wraps `gh` and `git` onto the binary's `PATH`, so nothing else is needed.

### Installer script

```sh
curl -fsSL https://raw.githubusercontent.com/candril/riff/main/scripts/install.sh | bash
```

The installer detects your platform, downloads the latest release, verifies its SHA256 against the
release's `SHA256SUMS`, and puts `riff` in `/usr/local/bin`. Two variables change that:

```sh
RIFF_INSTALL_DIR=~/.local/bin …   # somewhere else on your PATH
RIFF_VERSION=0.1.0 …              # a specific release
```

Or download `riff-<os>-<arch>.gz` from the releases page by hand, `gunzip` it, and put it on
your `PATH`.

### From source

riff is a [Bun](https://bun.sh) application, so a clone runs as it is:

```sh
git clone https://github.com/candril/riff.git
cd riff
bun install
bun scripts/build.ts   # → dist/riff, a standalone binary
```

With [just](https://github.com/casey/just): `just build`, or `just install-bin` to build and
install it to `~/.local/bin`. `just dev` runs from source with hot reload, `just run <target>`
runs it once without building.

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
