# The Review, In a Local Diff

**Status**: Done

## Description

Run `riff` on a branch that has a pull request and the header says so —
`#1213`, from the `gh` call spec 079 already makes in the background. Then
nothing else does. The comments panel is empty, because a local review reads
`.riff/comments/local/` and a pull request's comments are filed under its
own identity.

So riff knew the review existed, named it in the header, and showed none of
it. The reader is looking at exactly the code it is about.

## Out of Scope

- Fetching. This reads what is already on disk; `riff pr` and `riff comments
  fetch` are what put it there. A local review opens in a second and must
  not start waiting on GitHub for comments nobody asked for.
- The info panel. It wants the whole pull request — title, checks, reviews,
  commits — which local mode does not load, and loading it would make `riff`
  into `riff pr`.
- Replying, resolving on GitHub, or publishing from a local review. Those
  paths already guard on `prInfo`, which local mode has none of, so they
  no-op rather than misbehave.

## Capabilities

### P1

- A local review on a branch with a pull request shows that review's
  comments, on the lines they are anchored to.
- Only the ones this diff has a row for. A review comment was written
  against the pull request's diff, not this one, and the exemption ordinary
  review comments get from spec 085's filter does not apply to a comment
  merged in from somewhere else.
- Nothing is fetched. A review riff has never opened shows nothing, which is
  the same answer `:RiffPr` gives in the editor before it fetches.

## Technical Notes

It hangs off the `findCurrentPr()` call riff already makes in local mode for
the header, so it costs no extra round trip — one store read after an answer
riff was waiting for anyway.

`commentsWithRows` is `commentsInView` without the exemption: every comment
has to have a row, whatever kind it is.
