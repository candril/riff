# Plan: riff Reads Files

**Status**: Draft

Orchestrates specs 084–088. Each is implementable on its own; this says in
what order and why, and records the decisions the specs assume.

## The goal

`riff .` opens the repository rather than a diff: the tree lists every file,
`Ctrl-f` finds one, the content is drawn the way riff draws a diff — folds,
flash, search, markdown tables, mermaid, highlighting from the file — and `c`
leaves a comment on any line of it.

The reason is not navigation and not rendering. It is the loop that already
works: riff writes comments to `.riff/`, `riff comments --json` hands them to
Claude, `riff comments resolve` retires them. Today a comment can only exist
on a changed line, so that loop can only ever describe a diff. Let a comment
sit on any file and `.riff/` becomes a review-shaped queue of work over the
whole codebase — the same mechanism, pointed at everything.

```
  riff                 the working copy's changes      (today)
  riff gh:o/r#123      a pull request                  (today)
  riff HEAD~3..HEAD    a range                         (today)
  riff .               the repository, as files        (this plan)
```

## The line that keeps riff from becoming an editor

**riff never writes to a file it shows.** Read-only, forever. Anything that
needs changing leaves through `ge` / `gd` to `$EDITOR`, or through a comment
that Claude acts on.

Without that rule, "riff shows files" drifts into a worse nvim: a pager that
grows an insert mode, then a save, then a formatter. With it, showing a file
is still one job — reading code with comments attached — and the diff is
simply the most common thing to read.

## Order

```
  084 file mode ──┬── 085 comments on files ── 086 the agent queue
                  ├── 087 a tree over a repo
                  └── 088 outline & occurrences
```

| # | Spec | Delivers | Done when |
|---|---|---|---|
| 084 | File Mode | `riff .`, a file drawn as a zero-change diff | Opening a file gives folds, flash, search, tables, mermaid and highlighting, with no code path of their own |
| 085 | Comments on Files | `c` on any line; local-only, and honest about it | A note on an unchanged file saves, reopens, and is refused by every publish path |
| 086 | The Agent Queue | `riff comments --json` over a repo, not a diff | Claude can be handed "every open note in this repo" and retire them one at a time |
| 087 | A Tree Over a Repo | Tree and picker at ten thousand files, off `rg --files` | `Ctrl-f` in a monorepo answers as fast as it does on a PR |
| 088 | Outline & Occurrences | `gO` outline, spec 071's occurrence picker, off `rg` | "Where else is this called" is answered without leaving riff |

**084 first and alone.** It is the seam; everything else assumes it.
**085 → 086** is the reason the plan exists, so it comes before the polish.
**087** is the week of real work and can land late — a repo of a few hundred
files is usable without it. **088** subsumes spec 071, which was drafted for
the diff and is better built once files are in scope.

## How to work this plan

**One spec per session.** Start a context with "implement
`specs/084-file-mode.md`" — not "do the plan".

Finishing a spec means: the "Done when" above is true, tests and typecheck
pass, the behaviour was checked in the running app and not only in tests, the
spec's status goes `Ready` → `Done`, and its row in `specs/README.md` says so.

Pick the next unstarted spec whose dependencies (the arrows under **Order**)
are already `Done`.

## Decisions already made

- **A file is a diff with no changes.** The content is fed through
  `DiffLineMapping` as context rows on one side, so folds, flash, `/`,
  comments, peeks, tables, mermaid and spec 080's highlighting keep working
  without a second content model. Any design with two models forks the app.
- **Comments on unchanged code are notes, never review comments.** GitHub
  cannot anchor a review comment outside a diff. The composer says so before
  anything is typed, and `publishableLocalComments` refuses them the way it
  already refuses locally-resolved ones.
- **ripgrep finds things.** `rg --files` for the file list — it is the
  ignore-aware walk riff would otherwise write, and it is what makes ten
  thousand files answer instantly — and `rg` for content. riff already
  stands on `gh`, `git` and `jj`; a search tool is the same kind of
  dependency, and writing a worse one is not a feature. When `rg` is not on
  the PATH riff says so and falls back to its own walk and its own fuzzy
  filter: slower, no content search, still usable.
- **No LSP.** It is a stateful, per-language dependency tail that turns a
  review tool into an IDE host, and it answers less than it looks: the
  questions a review asks are "what is in this file" and "where else is this
  called". tree-sitter — already in riff, already parsing whole files for
  spec 080 — answers the first; ripgrep over symbol names answers the second.
  If both land and go-to-definition is still missed, that is the moment to
  reconsider, with evidence rather than in advance.
- **No nvim plugin.** riff's mermaid and table rendering is entangled with
  the diff model — two sides, `Tab` for the version being replaced, folds
  over a hunk — and ported to Lua it degrades into a preview several plugins
  already do, while forking the codebase across two runtimes. The cheap
  version of that wish is a twenty-line editor command that opens **riff** on
  the current file.
- **`riff .` is the spelling**, because `.` is already how every other tool
  says "here", and riff with no argument keeps meaning the working copy's
  changes.

## Not in scope anywhere here

- Editing, formatting, saving, or any write to a file riff shows.
- Publishing a comment on unchanged code to GitHub. It cannot be done, and
  pretending otherwise would lose someone's note.
- A second content model for "files" beside the diff's.
- Language servers.
- Reimplementing riff's rendering anywhere else.
- Writing a search engine. `rg` is the search engine.
