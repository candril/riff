# Changelog

All notable changes to riff are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release workflow lifts
the section matching a tag into that release's notes — an unwritten entry ships an empty
release, so write it before tagging.

## [Unreleased]

## [0.4.0] — 2026-11-11

### Added

- **A chat with Claude beside the diff** — `Ctrl-r` opens a column where an agent on your
  Claude subscription, limited to riff's own read-only tools, answers questions about the
  change: it reads the diff, any file at head or base, the review's threads and the PR's
  conversation. Each question carries your place in the diff and the threads on that line.
  `@line`, `@selection`, `@file`, `@pr` and `@path` attach more, offered in a picker after
  `@`; `Ctrl-g` writes the question in `$EDITOR`, `Shift-Enter` breaks the line, `Ctrl-e`
  widens the column.
- **The agent drafts comments** — it proposes a comment on a line, or new wording for one of
  yours, in a sentence or two, and riff opens it in the composer for you to keep or change.
- **The chat picks up where it left off** — a review's conversation and agent session are
  kept in `.riff/` and resumed on the next visit, and the agent is told when the PR head moved
  meanwhile. riff checks the installed `claude` against the agent SDK at startup and says in
  the chat when they drift.
- **Side by side** — `\` shows the diff split, old against new, at 120 columns or wider.
  Search, selection, flash, the mouse wheel and comments work in each pane, and each pane
  scrolls sideways on its own.
- **Blame** — `gB` opens a peek naming the commit and PR that last changed the cursor's line
  (`go` opens it, `y` copies the sha); `gb` toggles a dimmed column of who last changed each
  line. From jj, git or GitHub, renamed files under their old name.
- **Rendered markdown** — `gR` on a markdown file shows it rendered in place of its diff, each
  row on its source line, so motions, search, marks and comments still work. Fenced code is
  highlighted by its language and mermaid blocks are drawn as diagrams; `gR` again brings the
  diff back.
- **Global marks** — `m{letter}` marks a line and `'{letter}` returns to it from anywhere in
  the review, `]m`/`[m` walk them, `Ctrl-k` lists them (`Ctrl-x` deletes) and the gutter shows
  the letter. A mark follows its line's text when the PR changes; `m{letter}` on its own line
  removes it.
- **Merge status** — the PR overview opens on whether the PR can merge, one line per gate:
  checks, approvals, unresolved conversations (each opening onto its thread), conflicts, how
  far the head is behind its base, and its place in the merge queue. Folded, the header names
  what blocks.
- **Act on the PR from riff** — the palette marks it ready or back to draft, merges it by any
  method the repository allows (deleting the branch if asked), updates its branch by merge or
  rebase, arms or disarms auto-merge, and adds it to or takes it out of the merge queue. Each
  asks first with the exact command, and the panel follows at once.
- **Deploy a preview** — `gp` opens the Previews section; `Enter` on an on-demand app ticks
  the bot's deploy box after asking, and riff follows the build, listing its jobs, until the
  preview is live.
- **The overview folds like a tree** — `za`/`zo`/`zc`/`zR`/`zM` and `h`/`l` at every level.
  Sections arrive folded but for the description, the ones you open are remembered per review,
  and each header carries its summary inline, coloured by what it means.
- **Open a PR from nothing** — `riff` with nothing to review, or `riff --open`, asks for a PR:
  paste a link, or type `123`, `repo#123`, `repo/123` or `owner/repo#123`. Outside a repository
  an id asks which of the repositories in presto's config or `storage.repos` was meant, showing
  the PR in each. A reference on the clipboard is already in the field.
- **PR links land where they point** — a fragment opens the review comment's thread, the
  conversation comment or review in the overview, or the file and line in the diff
  (`#discussion_r…`, `#issuecomment-…`, `#pullrequestreview-…`, `#diff-…R12`).
- **`riff goto <url>`** hands such a link to the riff that already has the PR open, over a
  Unix socket each PR review listens on; it exits 1 when there is none.
- **`riff <workspace>@`** reviews another jj workspace's topic from trunk, with its comments
  filed in that workspace's `.riff/`.
- **Symbols in code spans** — a backtick and a letter or two in the composer offers the names
  on the diff's changed lines and its file paths, closest to the comment first. `Tab` writes
  the whole code span.
- **Fuzzy matches are highlighted** — every fuzzy picker marks the characters the query
  matched, and a scattered match prefers word starts and camelCase humps.
- **`%` and `gm`** jump to the matching bracket across the whole file, opening collapsed
  context to reach it and passing over brackets in strings and comments.
- **Narrower lists** — `H` in the thread panel shows only open threads, and in the file tree
  only unviewed files, the header saying how many are hidden. `Ctrl-g` in the occurrence
  picker narrows the hits by path and text, `!term` leaving rows out.
- **Lists move like the diff** — `Ctrl-d`/`Ctrl-u` and `gg`/`G` in the file tree and the
  thread panel; `h`/`l` in the tree climb to the parent directory and step into a child.
- **`+`** opens the reaction picker on the focused comment.
- **The PR description reads line by line**, `Ctrl-d`/`Ctrl-u` paging the cursor.
- **Mermaid state and ER diagrams** in `gl`, each state transition on a line of its own.
- **Open in riff board** — a palette action opens the PR in riff board, at the file and line
  under the cursor from the diff; `board.url` may be a `riff-board:` link.
- **`[browser] app`** names the browser riff opens links in on macOS, for a desktop whose
  default handler for web links is something else.
- **riff's version** shows dimmed at the right of the header and atop the help overlay.

### Changed

- **`Ctrl-o` writes a suggestion block** in the composer, on a line of its own when the
  cursor's line has text, and `Ctrl-y` accepts a picker's match, as in vim. The thread panel
  highlights a suggestion in the commented file's language.
- **No borders** — surfaces stand apart by shade: the diff and the description on one,
  panels, pickers, modals and toasts on a second, inputs and the selected row on a third.
- **The thread panel is a column beside the diff**, which narrows to keep it in view. The tree
  and the panel say how many rows lie above and below rather than drawing a scrollbar.
- **A jump lands with its line at the centre of the diff or higher**, not near the bottom
  edge.
- **The tmux Claude handoff is gone**; the chat column does what it did. Files older versions
  left under `.git/riff-ai-review/` stay until removed by hand.
- **No keybinding hints** in the status bar or the PR view's footer.
- **The UI runs on Solid and `@opentui/keymap`**: a view redraws only what changed, and a `j`
  in split view redraws a 10,000-line diff in under 16 ms.
- OpenTUI 0.6.0: variables in highlighted code are no longer coloured as constants, and the
  file tree no longer shows a scrollbar when its files fit. The chat brings in the Claude
  Agent SDK 0.3.296.

### Fixed

- **A viewed file whose diff changed is marked outdated** — the orange ✓, `(N outdated)` and
  `]o` never fired; GitHub's dismissed viewed state now reads as outdated, not unviewed.
- **Replies join the thread they were asked on**, not the newest one on that line. A reply
  typed after Submit Review stays in its thread, and a submitted review's comments stay on
  screen until GitHub's copies arrive.
- **Actions follow the review on screen** — comments, reviews, PR actions, the comment poll
  and focus-in refresh act on the review riff shows now, not the one it started on, and a
  local reload keeps the branch's pull request.
- **Git reviews read the right files** — one revision from the revision to the working tree,
  as `git diff <rev>` does; a branch or a range at the two ends its diff runs between.
- **Wide glyphs and control characters** take the cells they are drawn in, so the cursor,
  wrap, sideways scroll and flash labels land where they show.
- **Highlighting** — a markdown file's fenced code is coloured by its language in the diff,
  dim colours stay readable on changed words and tinted rows, a keyword inside a name is no
  longer coloured as one, GraphQL directives get a colour, and a generated GraphQL schema fits
  the whole-file cap.
- **`Ctrl-o` and `Ctrl-i`** bring back split or unified and the panel that had focus, return
  to an entry's line after a fold or a refresh, and walk the history the way nvim's do.
- **`Ctrl-c` and a terminal hangup leave as `q` does**, ending the agent session and recording
  the visit.
- **`zA` unfolds a file's blocks once all are folded**, and `zM` no longer reopens a block
  folded before it.
- **The palette runs every action it offers**, through the command its key runs, and shows
  that key.
- **Narrow and short terminals** — the diff stays readable at 80 columns with the chat and
  threads open, and the help overlay, the palette and the pickers fit and scroll.
- **`gx` on the PR view finds the preview links the bot posted.**
- **The PR edit writes its title only into the PR it edited**, and the PR comment prompt shows
  GitHub's refusal instead of "Submitting...".
- **The diff takes its new width as soon as `Ctrl-b`** hides or shows the file tree.

## [0.3.0] — 2026-09-25

### Changed

- OpenTUI 0.5.12.

### Added

- `Ctrl-s` lists every row of the diff that matches what you type, grouped by file with a
  count per file, and `Enter` goes there. `/` answers "take me to the next one"; this
  answers "where does this appear at all", which used to mean pressing `n` and rebuilding
  the picture one match at a time.

- **`riff --demo`** — a review of a repository riff generates in `TMPDIR`: five files with a
  modification, an addition and a deletion over them, with no network call and nothing written
  into the repository it was launched from.

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
- **Delete a comment from nvim** — `<leader>rd`, and `Ctrl-x` / `Ctrl-d` in the composer
  retire the comment it has open. Only ever your own: the review's comments are GitHub's.
- **The composer shows what is already on the line, the review included** — a line carrying
  someone's review comment opened a blank composer, as if riff had lost it.
- **Toggling the comment display reaches the review too** — `:RiffToggle` redrew only your
  own notes, so a pull request's comments stayed in whichever mode they were drawn in while
  the message said otherwise.
- **`i` and `a` open the pull request the header names** — in a local review on a branch
  that has one, the overview and the feed were keys that silently did nothing. They load it
  now, in place, and land where you asked — building the PR info panel a local review never
  had, without which the view switched onto nothing and looked stuck on the diff.

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

[Unreleased]: https://github.com/candril/riff/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/candril/riff/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/candril/riff/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/candril/riff/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/candril/riff/releases/tag/v0.1.0
