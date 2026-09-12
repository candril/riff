# Changelog

All notable changes to riff are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

### Added

- **riff reads files** — `riff .`, `riff src/` and `riff src/app.ts` open a path instead of
  a diff, drawn as a diff with no changes so folds, flash, `/`, tables, mermaid and the
  syntax highlighting all come with it. A directory opens folded. A path that exists wins
  over a revision of the same name; `-r <rev>` says you meant the revision. Commenting is
  refused for now — notes on a file are the next spec.
- **Comments from nvim** — `riff comments add --file F --line N` writes a comment from
  outside riff, body on stdin, and `nvim/` ships a plugin that uses it: `<leader>rc` opens a
  markdown buffer on the current line or selection, and every commented line shows the start
  of what was said beside it. nvim keeps the navigation; riff keeps the comment.
- **Notes never leave the machine** — a comment written where no diff is showing is stored
  as one, and every publish path refuses it rather than losing it to a 422 at the API.
- **`c` works on any line riff is showing** — a file opened with `riff .`, context expanded
  outside a hunk, anywhere the cursor sits on code. The composer says `Note … local only,
  never published` before you type. A note appears only where riff has a row for it, so a
  pull request is not buried under remarks about the rest of the repository.
- **`riff comments` is a queue an agent can be pointed at** — `--path` narrows it to a file
  or a directory, every thread in the JSON says whether it is a note or a review comment,
  and every one says where its line is now: `here`, `moved` to a line it names, or `lost`.
  A note pinned to a worktree that keeps being edited no longer points at the wrong code
  without saying so.
- **The nvim plugin shows what is there** — a sign in the gutter on every commented line,
  `:RiffShow` to read the comments on a line, and `:RiffToggle` between the comment's
  opening text and a single dot for when the marks are in the way. Writing a comment on a
  line that already has one shows what was said above the composer.
- **`riff comments edit <id>`** — rewrite a comment's body from outside riff. The anchor is
  not touched: changing what a comment says is not changing which line it is about.
- **One key in nvim** — `<leader>rc` comments on a line, or opens the comment already on it
  on what it says. `Ctrl-s` saves from either mode, `Esc` abandons, and `:w`, `:x` and `ZZ`
  work as they do anywhere else. The separate viewer, editor and open-in-riff commands are
  gone: three doors onto one room.
- **The review, in nvim** — `<leader>rp` fetches the pull request for your bookmark or
  branch and draws its comments on the file, with who said what, in their own gutter sign;
  `<leader>rP` puts them away without touching your notes. Nothing polls and nothing
  fetches behind your back. A comment whose line has moved is drawn where the line is now,
  read out of the hunk GitHub sent; one whose code has since changed is not drawn, and
  you are told how many there were.
- **`riff comments fetch`** pulls a pull request's comments into `.riff/` without opening
  riff, and `riff comments --synced` lists the review's own comments beside your notes.
- **Every comment in the repository, from nvim** — `<leader>rl` lists the open ones in
  snacks' picker (quickfix without it) and jumps to the line each is on now. `<leader>rx`
  marks one done. A gutter sign only ever told you about the file you already had open.
- **One list, both kinds** — `riff comments --json --all` is your notes *and* the comments
  on the pull request for your branch, in one report, each thread tagged and carrying the
  commands for the store it came from. `<leader>rl` uses it, so "where is there something
  to deal with" is one question again instead of two keys.
- **`riff` on a branch with a pull request shows that review** — riff already named the PR
  in the header and then showed none of it. Its comments now appear on the lines they are
  anchored to, for the lines this diff actually has. Nothing is fetched: `riff pr` and
  `riff comments fetch` are what put a review on disk.
- **`i` and `a` open the pull request the header names** — in a local review on a branch
  that has one, the overview and the feed were keys that silently did nothing. They load it
  now, in place, and land where you asked.

### Fixed

- **`Ctrl-o` and `Ctrl-i` know about every jump** — the picker, the tree, flash, thread
  motion, links and the feed are all in the history, because one place records where you
  came from instead of twenty navigations each remembering to. Stepping and scrolling
  inside a file still are not jumps, and a jump now lands in the column it left.
- **Going back no longer flickers** — a jump painted the destination at the scroll position
  of where it came from and then moved it. One paint now, and the jump keeps your marks and
  your last search instead of rebuilding the cursor from scratch.
- **The tree says which file you are reading** — the file under the diff cursor is named in
  the accent colour, not only shaded, so `]f` and `[f` are legible at a glance from the
  other panel.
- **Sequence diagrams name their columns at both ends** — participants are drawn at the
  foot as well as the head, the way mermaid draws them, so the bottom of a long exchange
  still says who is who.

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
