# Stacked PRs

**Status**: Done

## Description

A PR whose base is another PR's branch looks like any other until the base
moves. Then its diff swells with the base's rewritten commits, GitHub says
`DIRTY`, and riff's header says `! conflicts` — all true, none of it the
useful part. The useful part is *this PR is stacked on #1217, and #1217 was
rewritten since you branched*. riff can know that from two requests it does
not make today.

## Out of Scope

- Rebasing for you. riff names the fix; the branch is yours.
- Stacks deeper than one. The base's own base is the base PR's business.
- Local mode. A local diff has a revset, not a base PR.

## Capabilities

### P1

- When the base branch is the head of an open PR, the overview's metadata
  block says so: `stacked on #1217 OSA-62316 import the Swiss address
  register`.
- When that base has moved since this PR branched, the same line says which
  way: **moved** (new commits on the base; the diff is still right) or
  **rewritten** (the base was force-pushed; the diff now carries the base's
  changes and the fix is a rebase) — with the count.
- A rewritten base is worth a toast on opening: it changes what the diff
  means, and it is the thing the reader is least likely to guess.
- The stack is re-read on refresh, like everything else.

## Technical Notes

`GET /repos/{o}/{r}/pulls?head={o}:{baseRef}&state=open` says whether the
base is a PR. `GET /repos/{o}/{r}/compare/{baseHead}...{head}` says how the
two heads sit: `behind_by` and the `merge_base_commit`. Rewritten versus
moved is one check — whether the merge base is still one of the base PR's
commits (`GET /pulls/{n}/commits`). Moved: it is, the base just grew.
Rewritten: it is not, the base's history no longer contains the point this
PR branched from.

All three are REST, so they spend from the budget the GraphQL bundle does
not touch, and they run after the first render rather than before it.
