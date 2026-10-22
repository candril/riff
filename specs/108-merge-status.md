# Merge Status

**Status**: Done

## Description

Whether a PR can merge is the question that sends a reviewer back to the
web: GitHub spreads the answer over the merge state, the review decision,
the threads, the checks and the base. The PR info panel answers it in one
place. A "Merge status" section at the top of the panel, replacing the
Checks section, carries a verdict after its title and one line per gate
GitHub applies, so nothing hides behind the first thing that blocks.

The header's one-word reading (`src/utils/merge-verdict.ts`) stays: it
says whose move it is, this section says why.

## Out of Scope

- **Conflicting file names.** GitHub's API does not report which files
  conflict, so the conflicts line says only `conflicting`, never which
  files.
- **Legacy commit statuses.** They stay filtered out of the checks; a
  required legacy status shows up only through the branch
  protection fallback (`blocked by branch protection`).
- **Merging from riff.**
- **Changing the header's one-word verdict.**

## Capabilities

### P1

- **The section**: "Merge status" first in the PR info panel, in place of
  Checks, borderless like the rest of the panel
  ([106](./106-borderless-ui.md)). It is folded on arrival like every
  section ([067](./067-info-panel.md)), its verdict naming what blocks,
  unless the reader left it open in this review; opened, its checks line
  is open too. Its header carries no count.
- **The verdict** right after the section's title, two cells on, like
  every other section's summary: `▶  Merge status  ✓ ready`.
  - `✗ blocked` when any line fails, or GitHub's merge state is `BLOCKED`
    (it refuses the merge, whatever the lines say);
  - else `⚠ mergeable with warnings` when any line warns or is pending, or
    GitHub's merge state is `UNSTABLE`;
  - else `✓ ready`.
  An information line never changes the verdict. The verdict takes the
  colour of the line state it matches (green, yellow, red), and shows
  folded or not.
- **A folded section names what blocks.** Open, the header is the verdict
  alone; folded and not ready, the verdict is followed by ` · ` and the
  reasons joined by ` · `, in the order of the lines, each in its line's
  colour (red failing, yellow warning):
  `✗ blocked · lint failing · 1 unresolved · conflicts`.
  - Failing checks: at most two names, required before optional, then
    `+N`: `lint failing`, `lint, e2e failing`, `lint, e2e failing +3`.
  - Pending checks are counted, never named, in the pending line's
    colour: `⧗ 4 pending`.
  - Unresolved threads: `1 unresolved`. Conflicts: `conflicts`.
  - A failing review line: `changes requested`, `1/2 approvals` when the
    approvals fall short of the rule, else `review required`.
  - A base that holds the merge: `behind main`.
  - Blockers: `draft`, `branch protection`, and `computing` while GitHub
    is still computing the merge state. An information line (auto-merge)
    never appears.
  Long lists stay in the section; the cap of two names keeps them out of
  the header. The header is never wrapped: at the panel's edge it ends in
  `…`.
- **One line per gate**: the icon, the gate's name padded to the longest,
  then its text. The icon comes from its state (`✓` ok, `⚠` warning, `✗`
  failing, `○` pending, `ℹ` information), with detail only where
  something is not fine:
  - **Checks**: a check passes on success, neutral or skipped; the total
    is every check.
    - `9/9 passed`, or `no checks`.
    - Failing: the first two named, required before optional, `+N` for
      the rest: `7/9 · lint, e2e failing`, `6/9 · lint, e2e +1 failing`.
      A failing required check fails the line; only optional ones failing
      warn, with ` (optional)` appended. When GitHub says nothing about
      which checks are required, every failure fails the line.
    - Otherwise, still running: pending, `7/9 · 2 running`.
  - **Reviews**: each reviewer's latest approval or change request counts.
    `N approvals`, or `N/M approvals` when a required count above zero is
    known (zero is no requirement); the noun follows the larger count:
    `1/1 approval`, `2/1 approvals`. Then ` · changes requested by
    a, b` and ` · waiting on x, y` for those still requested. It fails on a
    change request, on a review decision of `CHANGES_REQUESTED` or
    `REVIEW_REQUIRED`, or on fewer approvals than required, unless the
    review decision is `APPROVED`: GitHub's count outranks riff's.
  - **Conversations**: `all resolved`, or `N unresolved`: a warning, but
    failing when the merge state is `BLOCKED`, since the open threads are
    then what explains it.
  - **Conflicts**: `no conflicts`, a failing `conflicting`, or a pending
    `checking` while GitHub has not decided.
  - **Base**: `up to date with <base>`, or `N commits behind <base>`,
    failing when GitHub's merge state is `BEHIND` (the branch must be up
    to date) and a warning otherwise. Before the count arrives: `behind
    <base>` when `BEHIND`, else a pending `comparing with <base>`.
  - **Other blockers**, in this order: `draft`; `blocked by branch
    protection` when the merge state is `BLOCKED` and no failing or
    running required check, failing review or open thread explains it; a
    pending `GitHub is still computing the merge state`; and the
    information `auto-merge armed (squash)`. With none of them, `none`.
- **Expanding a line** shows its detail: checks expand to the full list,
  indented under their line, each failing one opening onto its annotations
  ([043](./043-check-annotations.md)); conversations to each unresolved
  thread, in the order the diff reads (file, then line): `⚠ greet.ts:12
  @bob  Rename this…`, a file-level thread `farewell.ts (file)`. Only a
  line with something under it opens: the checks line with any check, the
  conversations line with any unresolved thread. `l` / `Enter` open a line,
  `h` folds it, and `h` on a folded check or on a thread climbs onto the
  line and leaves it open (the fold keys of spec 067). The conversations line stays
  folded on arrival. A filter opens a line onto the checks or threads it
  matches (a thread on its author, body or file), and keeps a line whose
  name or text matches or that holds a match.
- **Jumping to a conversation**: `Enter` on a thread closes the panel and
  opens it in the thread view, as `Enter` on a thread in the Conversation
  section does; `o` opens it on GitHub (a local thread has nowhere to go)
  and `y` copies its body. Resolving stays in the Conversation section:
  `x` does nothing here.

### P2

- **Telling required from optional without GitHub's answer**, should a
  repository's checks come back with no `isRequired` at all.

## Data

| Datum | From |
|---|---|
| Checks, required or not | `statusCheckRollup` check runs, `isRequired(pullRequestNumber:)` |
| Approvals, change requests | `reviews`, the latest per author |
| Waiting on | `reviewRequests` |
| Review decision | `reviewDecision` |
| Required approvals | the larger of `baseRef.branchProtectionRule.requiredApprovingReviewCount` and every ruleset's `PullRequestParameters.requiredApprovingReviewCount` under `baseRef.rules` |
| Unresolved threads | `reviewThreads.isResolved`, on the root comments |
| Conflicts | `mergeable`, and `mergeStateStatus` `DIRTY` |
| Base, behind | `mergeStateStatus` `BEHIND`; the commit count from a compare after the first render |
| Draft, blocked, auto-merge | `isDraft`, `mergeStateStatus`, `autoMergeRequest` |

`branchProtectionRule` comes back null, without an error, to a token that
cannot administer the repository. For most readers the required count
therefore comes from rulesets alone, and is unknown (`N approvals`) on a
repository protected only by classic branch protection.

## API Budget

Everything but the behind count rides in the PR bundle query that riff
already runs on open and refresh: its measured cost is 54 points with and
without the new fields, and no new query runs per poll. The behind count is
a REST compare made once after the first render, like the stacked-PR check
([072](./072-stacked-prs.md)), not on the poll.

## Technical Notes

- `src/components/merge-status-model.ts`: `mergeStatus({ prInfo, comments,
  behindBy })` turns a PR into the verdict and its lines; `pointStyle`
  gives each line state its icon and colour.
- The section keeps the id `checks`: the nav, the restore and the row
  actions key on it. `flatCheckItems` (`src/components/pr-info-items.ts`)
  lays out its rows, a `point` per gate, the checks under the open checks
  line and a `thread` row per unresolved thread under the open
  conversations line; `checkRows` (`src/components/pr-info-check-rows.ts`)
  draws them, keyed `point:<id>` and `thread:<comment id>`.
  `isExpandablePoint(point, { checks, threads })` says which lines open.
  Which lines are open is `expandedPoints` in
  `src/components/pr-info-nav.ts`, per session like the open checks.
- `MergeStatus.threads` holds the unresolved root comments, sorted, and is
  what the conversations line counts, so its count and its rows cannot
  disagree. `getSelectedMergeThread` hands the row actions the thread
  under the cursor; `getSelectedCheck` never returns one for a thread row.
- `sectionConfigs` hands the header a `summary` of coloured spans for the
  folded section and an `openSummary` for the open one; there is no
  right-aligned part. `mergeHeaderSummary(status, checks)`
  (`src/components/merge-status-summary.ts`) builds the folded summary,
  `failingChecks` (in the model) giving the checks line and the header the
  same order. `sectionHeaderRow` cuts the header to the panel's width with
  `fitSpans` (`src/components/fit-spans.ts`), and `PRInfoSectionHeader`
  (`src/components/PRInfoHeaderViews.tsx`) draws it as one text.
- `PRInfoPanelClass` recomputes the model when the PR, the comments or the
  behind count change; `setBehindBy` takes the count from
  `fetchBehindBy` (`src/providers/github/lookups.ts`), which `app.ts`
  calls once per panel after the first render.
- `src/components/pr-info-header.ts`: `latestReviewStates`, the latest
  review per author, shared with the panel's approvers line.
- `PrInfo.mergeable`, `PrInfo.requiredApprovals` and `PrCheck.isRequired`
  in `src/providers/github/types.ts`, read by `prInfoOf` in
  `src/providers/github/session.ts`.
