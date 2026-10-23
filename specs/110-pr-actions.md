# PR Actions

**Status**: In Progress

**Not built**: every capability below: marking ready and back to draft,
merging, updating the branch, auto-merge and the merge queue, the keys in
the merge status section, the panel's refresh, and the merge status's
re-poll after a merge or an update.

## Description

The merge status ([108](./108-merge-status.md)) says whether a PR can merge;
acting on that answer still sends the reader to the web. riff acts on the
PR itself: it merges, marks it ready for review or back to draft, updates
its branch from the base, and arms auto-merge or queues it. Every one of
these is a write to GitHub, so each asks first, and the info panel follows
what riff did without a full reload.

## Out of Scope

- **The chat agent acting on the PR.** None of these actions has a path from
  the agent's text, as with tenor's ADR-003 ([102](./102-agent-chat.md)):
  riff runs `gh` from the confirm dialog's own fields, and only a key in
  that dialog sends them.
- **Closing or reopening a PR**, and changing its reviewers, labels or base.
- **An admin override GitHub does not offer.** riff merges past a block only
  where GitHub itself shows the override.

## Capabilities

### P1

- **Mark ready for review, and back to draft.** `Mark Ready for Review` is
  offered on a draft, `Convert to Draft` on an open PR that is not one.
  riff runs `gh pr ready N -R owner/repo`, with `--undo` for draft.
- **Merge.** The method is picked from those the repository allows (merge,
  squash, rebase); the default is the repository's default, or the method
  last used. Deleting the branch is optional. riff runs `gh pr merge`.
- **Update branch** from the base, by merge or rebase as GitHub offers,
  through GraphQL `updatePullRequestBranch`.
- **Auto-merge**: enabled with a method or disabled, through
  `enablePullRequestAutoMerge` and `disablePullRequestAutoMerge`. When the
  base has a merge queue, the same action adds the PR to the queue or
  removes it, through the merge-queue mutations.
- **Every action asks first** in riff's confirm dialog. The dialog shows
  `owner/repo#N`, the exact effect, and every field that goes out (the
  command, the method, delete branch). A key confirms; anything else
  cancels and sends nothing.
- **Offered only when it makes sense.** Merge only when the merge status
  says mergeable, or with the admin override GitHub shows; ready only on a
  draft; update only when behind. An action asked for where it does not
  apply says why in a toast (`PR is merged`, `PR is closed`) and does not
  fail. An error from `gh` shows in a toast carrying GitHub's message.
- **The panel follows.** After merge, ready, update, auto-merge, resolving
  or unresolving a thread, submitting a review, syncing or publishing, and
  editing the PR, riff updates the local state at once where the result is
  known, then refetches only what changed in one targeted query, never a
  full reload, and leaves the panel's folds and cursor where they were. A
  failed write puts the local state back. A refetch landing after riff
  moved to another PR is dropped.
- **Re-polling after merge or update.** GitHub computes the merge status
  asynchronously, so after a merge or an update riff re-polls it a few
  times over a minute, backing off while nothing changes.
- **Palette actions**, in the `github` category, plus keys in the merge
  status section, chosen when that step is built and listed in `g?`.

### P2

- **Remembering the delete-branch choice** per repository, like the method.

## API Budget

The targeted refetch is the PR bundle query alone (`fetchPrInfo` in
`src/providers/github/session.ts`): one GraphQL round trip of 54 points, no
diff, no REST comments. It runs once per action, never on a timer. The
re-poll after a merge or an update runs that query a few times over a
minute at most and stops early once the merge status settles, within the
budget in AGENTS.md.

## Testing

Tests stub `gh` through the action's sources; nothing in a test or a pty
run sends a real merge, ready or update.

