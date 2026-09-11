# Changelog

All notable changes to riff are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

## [0.2.0] - 2026-09-12

The release that came out of using riff on real pull requests every day.

### Added

- **Three views, one key apart** — `i` the PR overview, `a` the feed, `d` the diff, and the
  key of the view you are in takes you back. Each keeps its own position.
- **A feed of what happened** — commits, comments, reviews, checks and force-pushes in one
  stream, narrowed by a letter per kind, `Enter` on a row taking you where it lives.
- **The overview says what is true, once** — description, preview links, conversation,
  checks with annotations, approvals, commits and files, with the header carrying whose
  move it is and whether the PR is stacked on another.
- **riff remembers when you last looked** — what arrived since your last visit is marked,
  and `]n`/`[n` walk it.
- **Long lines** — the diff scrolls sideways with the cursor, `zw` soft-wraps, `gl` peeks
  the whole line, and the status bar says which column you are in.
- **Markdown, drawn** — tables as a grid with aligned columns, mermaid blocks as diagrams,
  HTML in comments translated rather than printed, and `Tab` for the version being replaced.
- **Syntax highlighting from the file itself**, so a hunk that starts inside a block comment
  is a comment; GraphQL and Terraform added.
- **`s` labels the rows of every list** — the tree, the overview, the feed, the comments
  panel — and one keystroke jumps.
- **Suggestions** — `Ctrl-y` writes a ```` ```suggestion ```` block for the lines the comment
  replaces, and a comment written on a selection covers that whole block.
- **Links you can follow** — `#412` resolved to its title and state, `gx` listing every link
  in the view, `gX` copying instead.
- **Commit ranges** — mark commits in `Ctrl-g` with `Space` and `V`, read them as one diff.
- **A second thread on a line**: writing a comment starts a thread, `r` replies.
- **Emoji by shortcode** — `:` and two letters in the composer.
- **`gd`/`gD`** diff a file's two versions in `$EDITOR` or a tmux pane; **`ge`/`gE`** open it.
- **Folds for fenced blocks**, expanding context as a one-way action, kept drafts, the code
  an outdated comment was written against, and images named with `O` to open them.
- **The PR your branch already has** — named in the header in local mode, one action away.

### Changed

- `Ctrl-f` is the file picker everywhere; `/` is what narrows the list you are in.
- One comment store per repo in local mode: `riff`, `riff @-` and `riff abc123` are the same
  review, and notes filed by an older riff are moved in on first load.
- The commit picker is a list you mark rather than a search box, and says which changes are
  empty.
- `gd`/`gD` mean the editor diff always; Claude's drafted comments moved to the palette.
- A refresh changes the data and nothing else — no lost position, no reset folds.

### Fixed

- Reactions were written to GitHub but never read back.
- A subprocess could print its output over the screen; a picker opened from the palette
  could scroll it.
- The confirmation dialog's `y`/`n` went to the panel behind it.
- `g?` and `gx` were swallowed by the overview and the comments panel.
- Jumping to a resolved thread landed on a collapsed header, hiding the comment asked for.
- Picking a file from the overview moved the cursor somewhere you could not see.
- The composer jumped when the mention or emoji picker appeared.

## [0.1.0] - 2026-09-06

First release.

### Added

- **One diff, four ways to name it** — a PR number, a URL, a git or jj revset, or nothing
  at all for the working copy. Local and PR mode are the same app.
- **A diff that reads like a buffer** — vim motions, hunk and file jumps, folds, a
  jumplist, flash jump, search, and a file tree with its own filter.
- **Comments on the line** — drafts anchored to a line or a range, stored as Markdown in
  `.riff/` next to the code, walked with `]r`/`[r`, published only when you say so.
- **Publish deliberately** — one batched review (`gS`), a sync of edits, replies and
  resolutions (`gs`), or a single comment (`S`).
- **The PR without leaving** — overview with description, conversation, checks with
  annotations, approvals, commits and files; commit-by-commit narrowing; GitHub's own
  viewed state.
- **Claude Code integration** — a plugin and skill that read local comments with
  `riff comments --json` and retire them with `riff comments resolve`.
- Prebuilt binaries for macOS (arm64, x64) and Linux (x64, arm64), a curl installer, a
  Homebrew formula and a Nix package via [candril/homebrew-tap](https://github.com/candril/homebrew-tap).

[Unreleased]: https://github.com/candril/riff/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/candril/riff/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/candril/riff/releases/tag/v0.1.0
