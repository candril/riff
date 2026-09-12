# Opening the Branch's Pull Request

**Status**: Done

## Description

riff names the pull request a branch has in the header of every local
review — `#1213`, from a `gh` call it already makes (spec 079). Spec 094
made that review's comments show on the diff. The overview and the feed
still did nothing: `switchView` returns the state unchanged outside PR mode,
so `i` and `a` were keys that silently did not work, on a review that had
just told you a pull request was there.

## Out of Scope

- Fetching anything before it is asked for. A local review still opens
  without waiting on GitHub; pressing the key is what pays for it.
- Going back. Opening the pull request is opening it — `riff` again is how
  you get back to the working copy.

## Capabilities

### P1

- `i` and `a` in a local review on a branch with a pull request load it and
  land on the view that was asked for. The same load `riff pr` does, in
  place, so everything the pull request has — checks, reviews, commits, the
  feed, the whole comment set — is there afterwards.
- It says it is loading, and says what went wrong if it does, rather than
  looking like a key that does nothing.
- A second press while the first is still loading is ignored.
- Neither key does anything new where there is no pull request. `d` is
  unaffected: the diff is a view a local review has.

## Technical Notes

`switchView` returning the state unchanged is what the key handler reads as
"this view is not available here", which is exactly the moment to ask
whether it could be. The branch's pull request is in `state.branchPr`
already.

The load mirrors refresh's PR path — `loadPrSession`, `createInitialState`
with `"pr"` mode, then the viewed statuses — and keeps the reader's display
settings across the swap. The cursor resets: it pointed into a different
diff.
