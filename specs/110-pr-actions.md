# PR Actions

**Status**: In Progress

**Not built**: the keys in the merge status section, the panel's refresh
after anything but ready, draft, merge, update, auto-merge and the merge
queue, and the merge status's re-poll after a merge or an update.

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
  The palette offers one action per allowed method (`Squash and Merge`,
  `Create a Merge Commit`, `Rebase and Merge`); the default method applies
  to the merge status section's key, which comes later.
- **Update branch** from the base through `gh pr update-branch`, which
  sends GraphQL `updatePullRequestBranch`: `y` merges the base into the
  head, `r` rebases the head onto the base with `--rebase`.
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

## Technical Notes

- `src/features/pr-operations/ready-state.ts`: `handleToggleReady(ctx)`
  asks, flips `isDraft` at once, runs the mutation and refetches with
  `fetchPrInfo`; every write to state is guarded to the PR it started on.
  The palette's `mark-ready` and `mark-draft` both run it.
- `markPullRequestReady` / `markPullRequestDraft` in
  `src/providers/github/mutations.ts` return `{ success, error }` and never
  throw; `readyCommand` builds the arguments they run and the dialog shows.
- `src/features/pr-operations/merge.ts`: `handleMerge(ctx, method)` refuses
  with an info toast, in order, a PR that is not open, a draft, a method
  the repository has off, a base with a merge queue, and any merge status
  but `CLEAN`, `HAS_HOOKS`, `UNSTABLE`, or `BLOCKED` where the viewer can
  merge as admin (then with `--admin`). The last refusal carries the
  header's own reading from `mergeReading`. It then asks, sets `state` to
  `merged` at once, runs the merge and refetches, like ready-state. Both
  share `PrActionContext`, `patchSamePr` and `flash` from
  `src/features/pr-operations/pr-action.ts`.
- `mergeCommand(owner, repo, N, { method, deleteBranch, admin })` builds
  `gh pr merge N -R owner/repo --squash|--merge|--rebase [--delete-branch]
  [--admin]`; `mergePullRequest` runs exactly that argv, so the dialog
  shows what is sent.
- The PR bundle reads the repository's `squashMergeAllowed`,
  `mergeCommitAllowed`, `rebaseMergeAllowed`, `viewerDefaultMergeMethod`
  and `deleteBranchOnMerge`, and the PR's `viewerCanMergeAsAdmin`, into
  `PrInfo.mergeMethods` (in GitHub's button order: squash, merge, rebase),
  `defaultMergeMethod`, `deleteBranchOnMerge` and `viewerCanMergeAsAdmin`.
  They are scalars, so the query still costs 54 points.
- The confirm dialog takes an optional `alternative` (key, label, details,
  `onConfirm`). The merge dialog offers `d`, merge and delete the branch,
  with its own command under the main one, unless the repository deletes
  the branch itself; `y` then never passes `--delete-branch` and the
  message says so.
- `src/features/pr-operations/update-branch.ts`: `handleUpdateBranch(ctx)`
  refuses with an info toast, in order, a PR that is not open, a head
  known to be up to date (`behindBy` 0 and no `BEHIND`), and a head not
  yet known to be behind (`behindBy` unknown or failed and no `BEHIND`).
  It then asks, with the merge command as details and `r`, the rebase,
  as the alternative. Nothing is patched before gh answers. On success it
  calls `settleBehindBy(0)`, which sets the base lookups' count and drops
  an answer still out, so the base line reads up to date at once, then
  refetches with `fetchPrInfo`; every write is guarded to the PR it
  started on. It neither reloads the diff nor moves the head riff shows.
- `updateBranchCommand(owner, repo, N, method)` builds
  `gh pr update-branch N -R owner/repo [--rebase]`;
  `updatePullRequestBranch` runs exactly that argv. The dialog binds `d`
  and `r` as second answers, each acting only when the dialog offers it.
- `src/features/pr-operations/auto-merge.ts`: `handleEnableAutoMerge(ctx,
  method)` refuses, in order, a PR that is not open, a draft, a repository
  with `autoMergeAllowed` false, a method it has off, a base with a merge
  queue, auto-merge already armed, and a status of `CLEAN`, `HAS_HOOKS`
  or `UNSTABLE`, since GitHub rejects arming auto-merge on a PR that can
  merge now. `handleDisableAutoMerge` refuses a PR that is not open or
  has auto-merge off; `handleEnqueue` one that is not open, a draft, a
  base with no queue, a PR already queued and one armed to join the
  queue once checks pass; `handleDequeue` one that is not open, not
  queued, or has no node id. Each asks with no alternative, patches
  `autoMergeMethod` or `mergeQueue` at once, puts it back with an error
  toast if gh refuses, and refetches like merge.
- `autoMergeCommand` builds `gh pr merge N -R owner/repo --auto
  --squash|--merge|--rebase`, `disableAutoMergeCommand` `gh pr merge N
  -R owner/repo --disable-auto`, and `enqueueCommand` `gh pr merge N -R
  owner/repo`, which on a base with a queue queues the PR or arms
  auto-merge for the queue. gh has no dequeue, so `dequeueCommand(nodeId)`
  sends GraphQL's `dequeuePullRequest` through `gh api graphql` by the
  PR's node id. `enableAutoMerge`, `disableAutoMerge`,
  `enqueuePullRequest` and `dequeuePullRequest` run exactly those argvs,
  and none passes `--delete-branch` or `--admin`. The bundle reads the
  repository's `autoMergeAllowed` and the PR's `id` into
  `PrInfo.autoMergeAllowed` and `nodeId`, scalars that leave the cost at
  54 points.
- The panel takes the new `PrInfo` through `PRInfoPanel.setPrInfo`, which
  keeps its folds and cursor, the way a reaction reaches it.
