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
| `https://github.com/owner/repo/pull/123` | The same, by URL; a `#fragment` opens it [where the link points](#links-into-a-pr) |
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

### Links into a PR

A link copied from GitHub keeps its fragment, and riff opens the PR there once it has loaded.
A path after the number (`/files`, `/changes`) makes no difference.

| Fragment | Where riff opens |
| --- | --- |
| `#discussion_r<id>`, `#r<id>` | The review comment's thread, open on that comment — a reply opens the thread it is in |
| `#issuecomment-<id>` | The PR overview, on that conversation comment, opened |
| `#pullrequestreview-<id>` | The PR overview, on that review, opened |
| `#diff-<sha256>` | That file in the diff; the hash is GitHub's, of the file's path |
| `#diff-<sha256>R<n>`, `…L<n>` | That file, the cursor on line `n` of the new (`R`) or old (`L`) side; a range `R<n>-R<m>` lands on its first line |

Any other fragment, or a comment or file the PR no longer has, opens the PR as usual and says
what wasn't found.

## `riff goto`

```sh
riff goto https://github.com/owner/repo/pull/123#discussion_r456
```

Hands the link to the riff that already has that PR open, which goes there. Nothing starts and
GitHub isn't asked: it is the question a link handler asks before opening a second riff.

| Exit | |
| --- | --- |
| `0` | Delivered |
| `1` | No running riff has that PR open, or the argument is no PR link |
| `2` | The riff listening refused it |

Each PR review listens on a Unix socket, `$TMPDIR/riff-<uid>/gh-owner-repo-123.sock`, in a
directory only you can enter. The protocol is one line of JSON, `{"url": "…"}`, answered with
`ok` or `error: …`.

## Options

| Flag | |
| --- | --- |
| `-h`, `--help` | Usage, targets and examples |
| `-v`, `--version` | Version number |

## `riff comments`

The comments a review stored in `.riff/`, from the shell. Never touches GitHub.

| Command | |
| --- | --- |
| `riff comments [--json] [target]` | List local comments; `--json` is the machine-readable form (below) |
| `riff comments resolve <id> [target]` | Mark a thread done; it will never be published |
| `riff comments unresolve <id> [target]` | Reopen it |
| `riff comments remove <id> [target]` | Delete one comment |
| `riff comments clear [target]` | Delete every local comment for the target |
| `riff comments install-skill [--global]` | Install the Claude Code skill that works through them — this repo, or `~/.claude` for all of them |

`target` is the same argument `riff` takes and picks the comment set (`local` when omitted, or
`HEAD~3`, `123`, `gh:owner/repo#123`). `<id>` is the full id or the 8-character prefix the files
are named by. See [a review without GitHub](/riff/reference/comments/#a-review-without-github).

### What `--json` carries

Enough to act on a review without opening anything: `counts`, the repo `root`, and a `threads`
array — replies already nested under their root comment — where each thread has `id`, `file`,
`line`, `side`, `resolved`, `body`, `replies`, the `diffHunk` the reviewer saw, `code` (that line
as it reads in the working copy *now*), `context` (the numbered lines around it, `>` marking the
anchor), `commentFile`, and the literal `resolve` / `remove` commands that retire it.

`code` and `context` are `null` for a `LEFT`-side anchor — the line was deleted, so the working
copy can't show it and `diffHunk` is the record.

### The Claude Code plugin

The riff repo is a plugin marketplace, so the skill can be installed the usual way instead:

```sh
claude plugin marketplace add candril/riff
claude plugin install riff@riff
```

One skill, `riff-comments`, ~80 tokens always-on. `riff comments install-skill` writes the same
file directly if you'd rather not add a marketplace.

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
