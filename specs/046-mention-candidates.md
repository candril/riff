## Fuller @mention Candidate List

**Status**: Done

## Description

The @mention picker only offered handles derivable from loaded PR data — the
author, requested reviewers, and anyone who had already commented. Mentioning
a colleague who hasn't touched the PR yet, which is the usual reason to
mention someone, meant typing the handle from memory.

Widen the pool with the same list GitHub's own comment box uses
(`repository.mentionableUsers`), fetched in the background and cached, plus a
config list for handles that query can't return.

## Out of Scope

- Resolving team membership. Teams are opaque handles from riff's side.
- Validating that a mentioned handle exists before submitting.
- Persisting per-query search hits to the 24h cache — they live for the
  session only.

## Capabilities

### P1 - MVP

- Repo contributors/collaborators appear in the picker, fetched once per
  session in the background and cached for 24h in `.riff/`.
- `[mentions] extra = [...]` config for teams (`org/team`) and bots.
- Candidates stay ordered by signal: PR participants, then config extras,
  then the fetched roster.
- Works in local mode too (repo resolved from the checkout), where the
  picker previously had almost nothing to offer.
- Typing a fragment the cached roster can't cover searches GitHub for it, so
  large orgs aren't limited to the prefetch cap.
- Fetch failures are silent — the picker falls back to PR participants.

## Technical Notes

### Fetch

`getMentionableUsers(owner, repo)` in `providers/github.ts` pages
`repository.mentionableUsers` through `gh api graphql`, capped at 3 pages
(300 users). The pool is fuzzy-filtered down to 6 visible rows, so exhausting
a repo with thousands of contributors buys nothing.

PR mode fetches the **base** repo's roster: a fork PR is still commented on
there, so that's what GitHub resolves mentions against.

### Per-query search

The roster is a *prefix* of a large org's mentionable users, so `@koeck` can
come up empty even though the account exists. When a query of 2+ characters
leaves the picker with fewer than `MENTION_VISIBLE_LIMIT` matches,
`features/mentions/search.ts` debounces 250ms and asks
`mentionableUsers(query:)` — GitHub matches the fragment against both login
and display name — then merges the hits into the same pool, where the
existing fuzzy filter picks them up. Each fragment is asked at most once per
session.

The round-trip is ~500ms, so `state.mentionSearchQuery` drives a "Searching
GitHub for @…" line in the picker; without it the delay reads as "no match".

Note for anyone touching the GraphQL: the variable is named `$q`, not
`$query`, because `gh api graphql -f query=` uses that name for the document
itself and a `-F query=` silently replaces it.

### Where it lands

`collectMentionCandidates(state)` runs synchronously on every render, so the
fetch can't be awaited there. `features/mentions/prefetch.ts` writes the
result into `state.mentionableUsers` and re-renders; the cached list is
applied first so a warm start is instant. Both the roster and the per-query
hits *merge* into that array rather than replacing it, so they can land in
either order.

Config extras are read once per process — `loadConfig()` re-reads the TOML on
every call, which is fine at startup and not on every render.

### Trigger regex

`MENTION_TRIGGER_RE` gained `/` so team handles survive the slash; without it
the picker dismissed itself mid-`@org/team`.
