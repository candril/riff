# 042 - Reactions on PR Comments

**Status**: Draft

## Description

Let the user add and remove GitHub reactions (👍 👎 😄 😕 ❤️ 🎉 🚀 👀) on
the commentable surfaces of a PR, from inside riff. Reactions are cheap,
common, and conversational — a first-class way to acknowledge a comment
without typing "lgtm" again.

**Trigger surface**: **the command palette only.** No new global keybindings,
no inline picker widget. `Ctrl+p` → "React…" → submenu of the 8
reactions; Enter toggles. This keeps reactions discoverable, uses the
existing fuzzy-search affordance, and avoids pressuring the key namespace.

GitHub exposes reactions on five PR surfaces. This spec covers the four
that riff already surfaces:

1. **Inline review comments** (`ThreadPreview` + `CommentsViewPanel`)
2. **PR body** (Description section of PR view)
3. **Conversation comments** (Conversation section of PR view)
4. **Review summaries** (Reviews section of PR view)

Commit comments are skipped — riff doesn't surface them.

## Out of Scope

- **Global keybindings.** No `+` chord, no direct `g` sequences. Palette only.
- **Inline picker widget.** The palette's own submenu is the picker.
- **Reactions on commit comments.** Not surfaced in riff.
- **Reactions in local mode.** No GitHub to react on — the "React…"
  action is simply unavailable.
- **Seeing *who* reacted.** Aggregate count + viewer-reacted flag only.
- **Persisting reactions to local storage.** In-memory; re-fetched on load.

## Capabilities

### P1 — MVP (inline review comments)

- **Reaction data on `Comment`**: new optional field
  `reactions?: ReactionSummary[]` populated from GraphQL `reactionGroups`
  when a PR is loaded.
- **Display**: `ThreadPreview` renders a compact reaction row
  (`👍 3  ❤️ 1`) under each comment body. Viewer-reacted entries are
  highlighted. Empty reaction set → no row.
- **Palette entry — main level**:
  - `id: "react"`, `label: "React…"`, `category: "github"`.
  - `available(state)` returns true only when the app currently has a
    **reaction target** (see "Target resolution" below). In P1 that
    means ThreadPreview is open with a focused comment, or the
    CommentsViewPanel has a focused thread.
  - Enter on "React…" does **not** execute an action — it opens the
    submenu (new palette mode).
- **Submenu**: the palette clears its result list and shows 8 rows, one
  per reaction. Each row:

      👍 Thumbs up        3 · you reacted
      👎 Thumbs down      0
      😄 Laugh            1
      ...

  - Enter toggles the focused reaction on the resolved target.
  - `Esc` backs out to the main palette (preserves search query).
  - Fuzzy search works inside the submenu too (type "rocket", "thumbs").
  - After a successful toggle the palette **closes entirely** — same as
    any normal palette action. Adding multiple reactions is `Ctrl+p`,
    "rea", Enter, letter — four keystrokes per extra reaction. If that
    ever feels heavy, we can revisit (P3).
- **Target resolution**: the "React…" action reads a new
  `state.reactionTarget` field populated by whichever view currently
  owns focus. Views update this field in their input handlers:
    - `ThreadPreview` sets it to `{ kind: "review-comment", id: <focused comment's githubId> }`
    - `CommentsViewPanel` sets it to the focused thread's root comment's id
  The palette's `available(state)` checks `state.reactionTarget !== null`.
- **Optimistic update**: on Enter in the submenu, mutate
  `comment.reactions` (count ±1, flip `viewerHasReacted`, set/clear
  `viewerReactionId`), fire the REST call, roll back on failure with
  an error toast.
- **Toggle semantics**: POST `/pulls/comments/{id}/reactions` with
  `{content}` → returns reaction with `id` (cached as
  `viewerReactionId`). Remove: DELETE
  `/pulls/comments/{id}/reactions/{reactionId}`.
- **Reconciliation**: `gr` refresh re-fetches via GraphQL; in-flight
  optimistic state is overwritten.

### P2 — Other PR surfaces

Extend `reactionTarget` resolution so these views also set it when
focused/selected:

- **PR body reactions**: PR view's Description section, when it's the
  active section. Endpoint:
  `POST /repos/{owner}/{repo}/issues/{pr_number}/reactions`.
  Target: `{ kind: "issue", id: prNumber }`.
- **Conversation comments**: PR view's Conversation section, focused
  comment. Endpoint:
  `POST /repos/{owner}/{repo}/issues/comments/{id}/reactions`.
  Target: `{ kind: "issue-comment", id: <issueCommentId> }`.
- **Review summaries**: PR view's Reviews section, focused review.
  Endpoint: `POST /repos/{owner}/{repo}/pulls/{pr}/reviews/{id}/reactions`.
  Target: `{ kind: "review", reviewId: <id>, prNumber }`.

Each of these sections also renders a `ReactionRow` under the relevant
item so users see reactions without opening the palette.

### P3 — Polish

- **Reaction-only auto-refresh** after a toggle: lightweight GraphQL
  re-fetch of just `reactionGroups` for the affected target, so
  concurrent teammates' reactions show up promptly.
- **Sticky submenu**: optional config flag to keep the submenu open
  after a toggle, for rapid multi-reaction. Off by default.
- **Action-menu recents**: show recently-used reactions at the top of
  the submenu (if the palette ever grows a recents concept — not today).

## Palette Behavior

The action menu today is a flat, fuzzy-searchable list. This spec
introduces **one** new concept: a single action can open a submenu
instead of executing. The submenu shares the palette's input handling
(fuzzy search, up/down, Enter) but swaps out the list source.

State shape:

```ts
// src/state.ts
export interface ActionMenuState {
  open: boolean
  query: string
  selectedIndex: number
  submenu: ActionSubmenu | null   // NEW
}

export type ActionSubmenu =
  | { kind: "react"; target: ReactionTarget }
```

Transitions:

- Main-level `Enter` on an action whose `id === "react"` does **not** call
  `executeAction`; instead it sets `actionMenu.submenu = { kind: "react", target: state.reactionTarget }`, resets query, resets selection.
- Submenu `Enter` on a reaction row fires the reaction toggle and
  closes the palette entirely.
- Submenu `Esc` clears `submenu` (back to main list); main-level `Esc`
  closes the palette.

The action registry stays a flat list. The "React…" entry is special
only in that its execute path is a submenu-open instead of a handler
call — wired in `features/action-menu/execute.ts` or via a `kind:
"submenu"` discriminator on the action definition (implementation
detail; either is fine).

Submenu rows are a lightweight `{ content, count, viewerHasReacted }`
list rendered with the same row styling as main actions. The "count ·
you reacted" suffix is built on the fly from the current
`reactionTarget`'s live state so it reflects optimistic updates
between toggles.

## Technical Notes

### Reaction content values

```ts
export const REACTION_CONTENT = [
  "+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes",
] as const
export type ReactionContent = typeof REACTION_CONTENT[number]

export const REACTION_META: Record<ReactionContent, { emoji: string; label: string }> = {
  "+1":      { emoji: "👍", label: "Thumbs up" },
  "-1":      { emoji: "👎", label: "Thumbs down" },
  laugh:     { emoji: "😄", label: "Laugh" },
  confused:  { emoji: "😕", label: "Confused" },
  heart:     { emoji: "❤️",  label: "Heart" },
  hooray:    { emoji: "🎉", label: "Hooray" },
  rocket:    { emoji: "🚀", label: "Rocket" },
  eyes:      { emoji: "👀", label: "Eyes" },
}
```

Fuzzy search in the submenu operates on `label` (so "rocket", "thumbs",
"hearts" all match naturally).

### Data model

```ts
// src/types.ts
export interface ReactionSummary {
  content: ReactionContent
  count: number
  viewerHasReacted: boolean
  viewerReactionId?: number  // set after add; needed for REST delete
}

export interface Comment {
  // ... existing
  reactions?: ReactionSummary[]
}
```

Same shape attached to `PrConversationComment.reactions`,
`PrReview.reactions`, `PrInfo.bodyReactions` (P2).

`ReactionTarget`:

```ts
// src/types.ts
export type ReactionTarget =
  | { kind: "review-comment"; githubId: number }
  | { kind: "issue-comment";  githubId: number }
  | { kind: "review";         reviewId: number; prNumber: number }
  | { kind: "issue";          prNumber: number }
```

And in `AppState`:

```ts
interface AppState {
  // ...
  reactionTarget: ReactionTarget | null  // set by views on focus change
}
```

Views write this field from their input handlers whenever focus/selection
changes (ThreadPreview's focusedCommentIndex change, CommentsViewPanel
row select, PR view section changes, etc.). `closeThreadPreview` clears
it; closing the PR view (switching to diff) clears it.

### Fetching — extend existing GraphQL queries

GraphQL has `reactionGroups` on every Reactable subject, pre-aggregated
with `viewerHasReacted`.

Extend `getPrReviewThreads` to pull `reactionGroups` on each comment node:

```graphql
comments(first: 50) {
  nodes {
    databaseId
    reactionGroups {
      content
      viewerHasReacted
      reactors(first: 0) { totalCount }
    }
  }
}
```

Wire into `ReactionSummary[]` keyed by `databaseId`, attach in
`convertPrComment`. Same pattern for PR body, conversation comments,
review summaries when those P2 surfaces are added.

### Writing — REST via `gh api`

```ts
// src/providers/github.ts
export async function addReaction(
  target: ReactionTarget,
  content: ReactionContent,
  owner: string, repo: string,
): Promise<{ success: boolean; reactionId?: number; error?: string }>

export async function removeReaction(
  target: ReactionTarget,
  reactionId: number,
  owner: string, repo: string,
): Promise<{ success: boolean; error?: string }>
```

Path resolution inside the helpers — one `switch` over `target.kind`.
Delete fallback (if no cached `viewerReactionId`): GET the reactions
list filtered by `?content=X`, find viewer's, then DELETE.

### Palette rendering

`ActionMenu` takes on submenu awareness. Single extra prop:

```ts
interface ActionMenuProps {
  query: string
  selectedIndex: number
  mode: { kind: "actions"; actions: ResolvedAction[] }
       | { kind: "submenu"; title: string; rows: SubmenuRow[] }
}
```

`renderGroupedActions` branches on mode. Submenu rendering: no
categories, just the title at the top (`React on src/app.ts:42`) and
flat rows. Keeps the same search input bar and selection logic.

### Toggle handler

```ts
// src/features/reactions/toggle.ts
export async function toggleReaction(
  ctx: AppContext,
  target: ReactionTarget,
  content: ReactionContent,
): Promise<void>
```

1. Resolve current state for the target (lookup in state.comments /
   prInfo / etc. via a helper).
2. Optimistically mutate: flip `viewerHasReacted`, bump count ±1,
   clear `viewerReactionId` if removing.
3. POST or DELETE.
4. On success: if add, stash the new `viewerReactionId` in state.
5. On failure: invert the mutation, show toast with gh's error.

### Edge cases

1. **Network failure on add**: optimistic bump → POST fails → revert,
   toast. Palette is already closed at this point; user retries via palette.
2. **Permission / archived repo**: 403 → same as (1).
3. **Racing teammate reaction**: our count differs from server until
   next refresh; resolves on `gr`. No invariant to break.
4. **Delete fallback**: viewer reacted before riff was opened, so no
   `viewerReactionId` cached. Remove path issues a `GET ?content=X`,
   finds the id, DELETEs. Two round-trips for this rarer case.
5. **No reaction target when palette opened**: "React…" is filtered
   out by `available()`. If the user's focus changes while the palette
   is open, the already-displayed list doesn't refresh — worst case
   they hit Enter and the submenu opens with a stale target. The target
   is captured into the submenu state at open-time so "stale" here just
   means "the one you were looking at when you opened the palette",
   which is the principle-of-least-surprise behavior.
6. **Target disappears mid-flight** (comment deleted): POST 404s →
   revert + toast. Next refresh prunes the comment from state.
7. **PR-body reactions on closed/merged PRs**: GitHub still accepts.

### File structure

```
src/
├── providers/github.ts                  # add/removeReaction, extend queries
├── types.ts                             # ReactionSummary, ReactionContent, ReactionTarget
├── state.ts                             # reactionTarget, submenu in ActionMenuState
├── components/ActionMenu.ts             # submenu rendering path
├── components/ReactionRow.ts            # NEW: emoji + count pills
├── components/ThreadPreview.ts          # focusedCommentIndex, ReactionRow, set reactionTarget
├── components/CommentsViewPanel.ts      # ReactionRow, set reactionTarget (P1)
├── components/PRInfoPanel.ts            # ReactionRow in desc/conversation/reviews (P2)
├── features/action-menu/execute.ts      # submenu-opening branch for "react"
├── features/action-menu/input.ts        # route Enter/Esc differently in submenu mode
├── features/reactions/toggle.ts         # NEW: add/remove + optimistic
├── features/thread-preview/input.ts     # set reactionTarget on focus change
├── actions/registry.ts                  # "react" action entry
specs/
└── 042-comment-reactions.md
```

No new overlay component. No new keybindings.

## Verification

1. `bun run dev -- <pr-url>`. Open a file with comments. `Enter` on a
   commented line → ThreadPreview opens.
2. `Ctrl+p`. Palette opens. Type "react" → "React…" appears under the
   **GitHub** group. Without the thread open, "React…" is absent (the
   `available()` gate).
3. `Enter` on "React…". Palette content swaps to the reaction submenu,
   titled `React on src/app.ts:42 (@alice)`. Eight rows. 👍 is
   highlighted because the viewer already reacted (from a pre-seed on GitHub).
4. `Enter` on 🎉. Palette closes. Within a second, the reaction row
   in ThreadPreview shows `👍 1  🎉 1` (🎉 highlighted). GitHub UI
   confirms.
5. Reopen the palette, "React…", Enter, navigate to 👍, Enter. The
   reaction is removed; row now shows `🎉 1`.
6. Fuzzy search in submenu: `Ctrl+p`, "react", Enter, "rock", Enter →
   🚀 toggled.
7. `gr` refresh. Reactions re-fetch, visuals unchanged.
8. Offline / gh-logged-out: toast with gh error, optimistic state reverts.
9. P2: in PR view, move focus to the Description section. `Ctrl+p`,
   "react", Enter → submenu for the PR body. Same for Conversation
   (focus a comment) and Reviews (focus a review).
10. Negative cases:
    - Archive the repo between load and toggle → 403 toast, row reverts.
    - Delete the comment on GitHub, then toggle in riff → 404 toast,
      row reverts, next refresh removes the comment.
    - Open palette with no focused reactable item → "React…" is absent.
