# The PR Your Branch Already Has

**Status**: Done

## Description

`riff` on a working copy reviews what you changed. Half the time that
branch already has a pull request open, with reviewers on it — and riff,
which knows how to show you exactly that, says nothing.

It should say which PR, and take you there in one keystroke.

```
 riff  test/OSA-61896-travel-esim → master   #1198   All files (120)
```

## Out of Scope

- One view over both. Merging the PR's commits with the local ones is a
  different diff with a different base, two comment stores, and no honest
  answer for a line that exists in one and not the other. This spec is the
  cheap nine tenths: knowing, and getting there.
- Creating the PR. `gP` already does that, and now stops offering to when
  there is one.

## Capabilities

### P1

- In local mode riff asks whether the current branch or bookmark has a PR,
  in the background — a local review that never looks at the header should
  not wait for a `gh` call, and one that fails costs nothing.
- The header names it: `#1198`, dimmed when it is closed or merged, marked
  when it is a draft.
- **Review PR #1198** in the palette reopens riff on it, in the same
  terminal — what typing `riff 1198` does, minus the typing.
- `go` opens it in the browser from local mode too.
- **Create Pull Request** is not offered on a branch that has one.

## Technical Notes

`gh pr view <branch>` answers in one call and needs no repo lookup. The
branch is jj's nearest bookmark or git's current branch — the detection
`riff pr` already uses.

riff is built around one review per process: switching is a fresh riff on
the same terminal, spawned after the renderer is torn down, and the old
process exits with its exit code. `process.argv[1]` decides whether the
command is `bun <script> <n>` or the compiled binary and a number.
