# Blame

**Status**: In Progress

**Not built**: P2

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
- **A PR**: GitHub GraphQL `blame(path)` on the head or base commit,
  through `gh api graphql`, so no checkout is needed. Each range carries
  `associatedPullRequests(first: 1)`, which is the PR the peek names.
- **A local review's PR** comes from
  `gh api repos/{owner}/{repo}/commits/{sha}/pulls`, asked only when the
  remote is on GitHub, and remembered per commit unless it failed.

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
| git, a target | `gitSidesOf(target).head` | `gitSidesOf(target).base`, through `resolveGitBase` |
| PR | the loaded head sha | where head and base last met (`baseVersionRef`) |

### Caching

One file's blame is read whole and kept per `path@revision`, as a promise
that is dropped when it rejects, so a failure is retried on the next ask.
A working copy (jj's `@` or another workspace's, git's working tree) is
never kept: it changes while riff runs.

A file the side does not have, and a line past its end, answer null;
any other failure carries the tool's message.

### Files

- `src/providers/blame/types.ts`: `BlameCommit`, `BlameLine`, `FileBlame`
  (indexed by 1-based line number).
- `src/providers/blame/jj.ts`, `git.ts`, `github.ts`: the three parsers,
  and the jj template and GraphQL query.
- `src/providers/blame/sides.ts`: which revision a side means.
- `src/providers/blame/pr-lookup.ts`: `prForCommit`.
- `src/providers/blame/source.ts`: `createBlameSource`, with injectable
  runners for every spawn.
