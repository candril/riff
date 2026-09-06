---
title: CLI
description: Targets, flags, and how riff decides what you meant.
---

```sh
riff [OPTIONS] [TARGET]
```

One positional argument. riff pattern-matches it to work out whether you're asking for a GitHub
PR or a local diff — there is no `--pr` flag to remember.

## Targets

| Target | What you get |
| --- | --- |
| *(none)* | Uncommitted changes in the working copy |
| `pr` | The PR for the current branch or bookmark |
| `123`, `#123` | PR #123 in the current repo |
| `gh:owner/repo#123` | That PR, from anywhere on disk |
| `https://github.com/owner/repo/pull/123` | The same, by URL |
| anything else | A local revision: commit, range, branch, or jj revset |

```sh
riff                          # what you haven't committed yet
riff pr                       # the PR you're working on
riff 123
riff HEAD~3                   # the last three commits
riff main..feature-branch     # a branch comparison
riff branch:feature           # shorthand for git diff feature...HEAD
riff @-                       # a jj revset: the parent change
riff gh:facebook/react#1234
```

Anything riff can't recognise as a PR reference is handed to your VCS as a revision, so its
error message is the one you'll see if it isn't valid.

### Local targets

riff checks for jj first — a jj repo also has a `.git`, so the order matters — and falls back to
git.

**With jj**, the target is a revset: `jj diff --git -r <target>`. With no target, the diff is
`trunk()` to the working copy, which is the whole of the change you're currently building.

**With git**, no target means uncommitted work: unstaged changes, or staged if there are none, or
`git diff HEAD` if everything is committed but unpushed. A target is passed to `git diff`
directly, so ranges (`main..feature`), commits (`HEAD~3`) and everything else git accepts work as
they do in git. `branch:name` is the one piece of riff-specific sugar — it expands to
`git diff name...HEAD`, the three-dot form that shows what your branch added rather than
everything that happened on `name` since.

### PR targets

`riff pr` resolves the PR for whatever branch or bookmark you're on. The rest identify a PR
directly. Before fetching, riff settles where comments will live and asks about it if it had to
guess — see [storage](/riff/reference/configuration/#storage).

## Options

| Flag | |
| --- | --- |
| `-h`, `--help` | Usage, targets and examples |
| `-v`, `--version` | Version number |

## `riff comments`

The comments a review stored in `.riff/`, from the shell. Never touches GitHub.

| Command | |
| --- | --- |
| `riff comments [--json] [target]` | List local comments — `--json` adds `resolved`, `diffHunk` and the file path |
| `riff comments resolve <id> [target]` | Mark a thread done; it will never be published |
| `riff comments unresolve <id> [target]` | Reopen it |
| `riff comments remove <id> [target]` | Delete one comment |
| `riff comments clear [target]` | Delete every local comment for the target |
| `riff comments install-skill [--global]` | Install the Claude Code skill that works through them — this repo, or `~/.claude` for all of them |

`target` is the same argument `riff` takes and picks the comment set (`local` when omitted, or
`HEAD~3`, `123`, `gh:owner/repo#123`). `<id>` is the full id or the 8-character prefix the files
are named by. See [a review without GitHub](/riff/reference/comments/#a-review-without-github).

## Exit and errors

`q` quits. Draft comments are already on disk — there's nothing to save on the way out.

Startup failures print to stderr and exit non-zero: not a repository, a PR that doesn't exist,
`gh` not authenticated. Failures during a session become toasts, and for GitHub rejections they
carry GitHub's own message rather than `gh`'s generic one.

## Related tools

riff shells out to whatever's on your `PATH`, so these are only needed for the actions that use
them: `gh` (all GitHub features), `git` or `jj` (local diffs), `$EDITOR` (`gf`, `C`, `gP`),
`tmux` (`gF`), and `difftastic`, `delta` or `nvim` for the external-diff actions in the action
menu.
