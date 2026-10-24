# Blame

**Status**: Complete

## Description

A diff says what this PR does to a line, never what happened to it before.
When a line looks wrong, the reviewer's next question is who wrote it and
why: was it a deliberate choice the PR now undoes, or an accident the PR
should leave alone? Answering that today means leaving riff for a terminal
and a `git blame`, then finding the line again in its output.

riff answers it in place, for any line the diff shows: a changed line, a
context line, or one revealed by expanding context.

## Out of Scope

- **Following renames** further than jj, git or GitHub already follow
  them.
- **Walking further back** ("blame the parent"). The peek names one
  commit; the browser is where its history goes on.
- **The agent's blame tool.** Spec [102](./102-agent-chat.md)'s agent may
  read the same source later; it is not part of this spec.

## Capabilities

### P1 - The peek

- **`gb` on the cursor line opens a borderless peek** on `mantle`.
- **The peek names the commit**: its short sha, author, date and subject,
  plus the PR that introduced it when GitHub knows one.
- **The side follows the line.** A removed line is blamed in the base;
  any other line in the head.
- **From the peek**, `go` opens the commit, or its PR when there is one,
  in the browser, and `y` copies the full sha.
- **A line not yet committed**, in a git working tree, says so instead of
  naming a commit.

### P2 - The column

- **Blame for the whole file** as a dimmed column beside the line numbers,
  toggled per file. A run of lines from the same commit names it once.

## Technical Notes

### Sources

- **jj**: `jj file annotate -r <rev> -T <template> <path>`. The template
  prints one record per line: the line number, the commit id, the author's
  name, the author timestamp in UTC and the description's first line,
  split by `\x1f`. It leaves out the line's content, which can hold any
  byte.
- **git**: `git blame --porcelain [<rev>] -- <path>`, with no revision for
  the working tree. Porcelain names a commit's author, time and summary
  only on its first group, so they are carried per sha; the all-zero sha
  is a line not yet committed.
- **jj and git run from the repository root**, since the diff's paths are
  relative to it, so blame works from any directory inside the repo.
- **A PR**: GitHub GraphQL `blame(path)` on the head or base commit,
  through `gh api graphql`, so no checkout is needed. Each range carries
  `associatedPullRequests(first: 1)`, which is the PR the peek names.
- **A local review's PR** comes from
  `gh api repos/{owner}/{repo}/commits/{sha}/pulls`, asked only when the
  remote is on GitHub, and remembered per commit unless it failed. A
  commit GitHub does not know (`HTTP 404` or `422`, as an unpushed one
  answers) is remembered as no PR, so it is asked once.

### Which revision each side means

The diff's line numbers count in particular revisions; blaming any other
revision names the wrong line. Each side is the revision the diff and the
existing file readers (`getFileContent`, `getOldFileContent`,
`getPrBaseFileContent`) already use:

| Review | Head | Base |
|---|---|---|
| jj, no target or a working copy (`name@`) | that working copy | `trunk()` |
| jj, a revision | the revision | its parent (`rev-`) |
| git, no target | the working tree | `HEAD` |
| git, a single revision | the working tree | the revision |
| git, a range or `branch:` | `gitSidesOf(target).head` | `gitSidesOf(target).base`, through `resolveGitBase` |
| PR | the loaded head sha, or `getPrHeadSha` while none is loaded | where head and base last met (`baseVersionRef`) |

### Caching

One file's blame is read whole and kept per `path@revision`, as a promise
that is dropped when it rejects, so a failure is retried on the next ask.
A working copy (jj's `@` or another workspace's, git's working tree) is
never kept: it changes while riff runs.

A file the side does not have, and a line past its end, answer null;
any other failure carries the tool's message.

The base side of a renamed file is read under its old name, by the `gb`
peek as by the column, so the peek names `old/path:line` with `base`.

### The column (P2)

`zB` turns the column on or off for the file under the cursor: the file
shown, or in all files the one the cursor's line or header belongs to.
Turning it on reads the whole file's blame through `fileBlame`, the same
cached read `lineBlame` answers from, for each side the file has: an added
file asks no base, a deleted one no head, and a rename's base is read under
its old name. A failure, or no blame on either side, drops the column and
says why in a toast. The column is not kept across sessions.

The column sits between the mark's cell and the line number, so a row is
`[sign][mark][blame][number][space][code]`. It is 18 cells wide: the
8-cell short sha, a space, the author cut to 8 cells (by cells, so a wide
character never overflows) and a space before the number. It is drawn in
`overlay0` on the gutter's own background and carries no separator. Only
a file with the column on moves its code right; in unified the width is
part of each file section's origin, so wrapping, the terminal cursor,
sideways scrolling, flash and search all move with it. In split each
half's code origin is worked out per line the same way.

Unified blames a removed line in the base and any other line in the head,
as the peek does. Split blames the left half in the base and the right
half in the head, by the number each half draws.

A run of lines from one commit names it once, on its first line. Any row
that is not code (a file header, a hunk header, a divider, a folded
block) ends the run, so each hunk names its first commit again. A line not
yet committed reads `uncommitted`, also once per run. While the file's
blame loads, `…` stands at the top of its lines.

### Files

- `src/providers/blame/types.ts`: `BlameCommit`, `BlameLine`, `FileBlame`
  (indexed by 1-based line number).
- `src/providers/blame/jj.ts`, `git.ts`, `github.ts`: the three parsers,
  and the jj template and GraphQL query.
- `src/providers/blame/sides.ts`: which revision a side means.
- `src/providers/blame/pr-lookup.ts`: `prForCommit`.
- `src/providers/blame/source.ts`: `createBlameSource`, with injectable
  runners for every spawn; `fileBlame` and `lineBlame` share one cache.
- `src/features/blame/keys.ts`, `peek-state.ts`: `gb`'s peek.
- `src/app/peek-leaves.ts`: which chords may act while a peek is up, and
  which keys either peek leaves to the handlers behind it.
- `src/features/blame/column-keys.ts`, `column-state.ts`: `zB` and the
  per-file column state.
- `src/features/blame/demo-source.ts`: `--demo`'s blame, two commits per
  file and no network.
- `src/components/blame-column-model.ts`: what the column draws beside
  each line, and which side a line blames in each view.
- `src/split-view/blame-cells.ts`: the column's cells for the unified view
  and each split pane, and the width a line's column takes.
