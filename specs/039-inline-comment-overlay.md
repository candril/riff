## Inline Comment Overlay — Actionable Thread View & PR Conversation

**Status**: Draft

## Description

Replace the Tab-toggled comments-view panel with a single, context-preserving
overlay that is opened with `Enter` on a commented line (or `c` on any line to
compose). The overlay docks near the line in the diff (LSP-hover style) so the
underlying code stays visible, and it becomes the one surface where every
comment action happens: read, reply, edit, delete, resolve, react, submit.

A parallel chord `gC` opens a centered **conversation overlay** for PR-level
discussion (issue comments + review bodies), with the same interaction model
sans line anchoring.

This supersedes the day-to-day use of the comments-view panel introduced in
spec 010; that panel is retired.

## Motivation

- The existing `Tab` comments-view panel replaces the diff — users lose
  spatial context and have to rebuild it when jumping back.
- The current thread-preview modal (opened with `Enter`) preserves context
  beautifully, but is read-only — forcing users to round-trip through the
  Tab panel for every action.
- Unifying on the overlay eliminates a whole mode, removes a mental model,
  and keeps the cursor anchored to the code throughout review.

## Out of Scope

- Virtual-text inline comment previews in the diff itself (spec 013 — still
  draft; orthogonal).
- Suggested-changes (GitHub's ```suggestion blocks) rendering/apply.
- Keyboard-driven multi-select of reactions.
- Persistence/backfill of reaction state from before sync.

## Capabilities

### P1 — MVP

#### Inline thread overlay

- `Enter` on a line with existing comments opens a **docked overlay** anchored
  near that line (above or below depending on available space). The diff line
  remains visible.
- `c` on any line (commented or not) opens the same overlay in **compose
  mode** with the input focused.
- Overlay displays all comments in the thread (root + replies) vertically,
  with inline reaction summary per comment.
- Navigation inside the overlay:
  - `j` / `k` — move highlight between comments in the thread
  - `Ctrl-n` / `Ctrl-p` — close this overlay and open the next/previous
    thread in the PR (cursor follows)
  - `Esc` — close
- Actions (highlighted comment):
  - `r` — reply inline (focus drops into the input area at the bottom)
  - `R` — reply via `$EDITOR` (escape hatch for long-form)
  - `e` — edit highlighted comment (if yours); opens inline input prefilled
  - `E` — edit via `$EDITOR`
  - `d` — delete highlighted comment (with `y/n` confirm)
  - `x` — toggle thread resolved (applied to root, whichever comment is
    highlighted)
  - `S` — submit highlighted local or edited-synced comment
  - `+` — enter reaction picker (see below)
- Inline compose area:
  - Multiline input at the bottom of the overlay
  - `Ctrl-s` submits (saves the reply/edit locally — does *not* push to
    GitHub; that's `S`)
  - `Esc` discards when input is focused

#### Reactions

- `+` opens a **reaction picker row** at the bottom of the overlay:
  ```
  1:👍  2:👎  3:😄  4:🎉  5:😕  6:❤️  7:🚀  8:👀   (Esc)
  ```
- Pressing `1`–`8` toggles that reaction on the highlighted comment:
  - Not reacted → adds it.
  - Already reacted by current user → removes it.
- Picker closes after one pick (or Esc).
- Reaction summary shown under each comment body:
  `👍 3  ❤️ 1  👀 2` — own reactions shown bolded/underlined.
- Sync via `gh api repos/{o}/{r}/pulls/comments/{id}/reactions` (GET on
  fetch; POST/DELETE on toggle). Issue-comment reactions use
  `/repos/{o}/{r}/issues/comments/{id}/reactions`.

#### PR conversation overlay

- `gC` chord opens a **centered conversation overlay**. No line anchor.
- Stream combines chronologically:
  - PR-level issue comments (`gh pr view --json comments`)
  - Review bodies with non-empty text (`gh pr view --json reviews` →
    `body`, excluding `PENDING`)
- Same interaction model as the inline overlay: `j/k` to highlight, `r/R`
  reply, `e/E` edit, `d` delete, `+` react, `Ctrl-s` submit inline.
- `Shift-C` (existing "add PR-level conversation comment" action) is rebound
  to open this overlay in compose mode — single entry point.
- `]r` / `[r` chords do not traverse into PR-level comments (they're line-
  anchored thread motions only).

#### Motion between threads

- `]r` / `[r` — jump cursor in the diff to the next / previous commented
  line. Pushes a jumplist entry (see spec 038).
- `]R` / `[R` — like `]r`/`[r` but skipping resolved threads.

#### Retirement of comments-view panel

- `Tab` is reclaimed for the jumplist `Ctrl-i` / view-toggle migration
  already in spec 038 — the comments-view panel is removed entirely.
- Existing comments-view actions/keybindings are removed from
  `src/features/comments-view/`. Module deleted.
- Batch review surface (`gS` → `ReviewPreview`) remains untouched — it is a
  separate modal and already stands alone.

### P2

- Resolved threads dim their gutter `●` indicator; `zr` inside the overlay
  toggles visibility of resolved threads in `]r` / `[r` motion (acts as a
  filter equivalent to `]R`/`[R` becoming the default).
- Reaction picker also accepts a direct chord — e.g. `+1` / `+-` / `+h` —
  so power users skip the picker row.
- Unread indicator: lightweight count badge in header (`💬 3 new`) when new
  PR-level comments arrive since last open.
- `gC` highlights unread entries on open.

### P3

- Inline-compose supports `@mention` auto-complete from PR participants.
- Reaction summary groups collapse to a single count when >4 types.
- Emoji picker for markdown body (`:shrug:` expansion).

## Technical Notes

### State

Extend / replace in `src/state.ts`:

```ts
export interface InlineCommentOverlayState {
  open: boolean
  mode: "view" | "compose" | "edit" | "react"
  /** Anchor in diff that drove opening */
  anchor: { filename: string; line: number; side: "LEFT"|"RIGHT" }
  /** Comments in the thread, in display order */
  threadCommentIds: string[]
  /** Currently highlighted comment id (for action target) */
  highlightedId: string | null
  /** Draft body for compose / edit */
  input: string
  /** When editing, the comment id being edited */
  editingId: string | null
}

export interface ConversationOverlayState {
  open: boolean
  mode: "view" | "compose" | "edit" | "react"
  entries: ConversationEntry[]   // chronologically merged
  highlightedId: string | null
  input: string
  editingId: string | null
}

type ConversationEntry =
  | { kind: "issue"; id: string; author: string; body: string; createdAt: string; reactions: ReactionSummary }
  | { kind: "review"; id: string; author: string; body: string; createdAt: string; state: "COMMENTED"|"APPROVED"|"CHANGES_REQUESTED"; reactions: ReactionSummary }
```

Remove from `AppState`:

- `commentsView`-related fields (whatever lives for the old panel)
- `threadPreview` (replaced by `inlineCommentOverlay`)

Add:

```ts
inlineCommentOverlay: InlineCommentOverlayState
conversationOverlay: ConversationOverlayState
```

Extend `Comment` in `src/types.ts`:

```ts
reactions?: ReactionSummary          // populated on fetch/sync
pendingReactions?: Map<Reaction, "add"|"remove">  // optimistic local state
```

```ts
type Reaction = "+1"|"-1"|"laugh"|"hooray"|"confused"|"heart"|"rocket"|"eyes"
type ReactionSummary = Record<Reaction, { count: number; viewerReacted: boolean }>
```

### Components

New components in `src/components/`:

- `InlineCommentOverlay.ts` — docked overlay; computes placement (below line
  if room, else above, else centered) from the current viewport and the
  anchor line's screen position. Uses OpenTUI absolute positioning.
- `ConversationOverlay.ts` — centered modal reusing the same internal
  composer + reaction-picker widgets.
- `ReactionPicker.ts` — horizontal row shown inside either overlay.
- `CommentComposer.ts` — multiline input with `Ctrl-s` to submit, `Esc` to
  cancel; shared by both overlays and by edit flows.

Delete:

- `src/components/CommentsViewPanel.ts`
- `src/components/ThreadPreview.ts` (rolled into `InlineCommentOverlay`)

### Feature modules

New:

- `src/features/inline-comment-overlay/` — input dispatcher, open/close,
  mode transitions, action handlers.
- `src/features/conversation-overlay/` — same, for PR-level.
- `src/features/reactions/` — `toggleReaction`, `fetchReactions`, API
  wrappers around `gh api`.
- `src/features/thread-motion/` — `]r`/`[r`/`]R`/`[R` navigation helpers
  (builds a sorted list of anchors from `state.comments`).

Delete:

- `src/features/comments-view/`
- `src/features/thread-preview/`

### Providers

Extend `src/providers/github.ts`:

```ts
export async function fetchReactions(
  owner: string, repo: string, commentId: string, kind: "review"|"issue"
): Promise<ReactionSummary>

export async function toggleReaction(
  owner: string, repo: string, commentId: string, kind: "review"|"issue",
  reaction: Reaction, viewerReacted: boolean
): Promise<void>

export async function fetchConversation(
  owner: string, repo: string, number: number
): Promise<ConversationEntry[]>
```

Reactions are fetched lazily on overlay open (and memoized per session);
conversation is fetched when `gC` is first pressed and on explicit refresh.

### Key wiring (`src/app/global-keys.ts`)

- Remove the `Tab`-to-toggle-view-mode branch (already slated by spec 038).
- `Enter` on a diff line with comments → open `InlineCommentOverlay` in
  view mode (replaces current thread-preview open path at ~line 691).
- `c` on any diff line → open overlay in compose mode.
- Modal section for `InlineCommentOverlay` captures all input when open
  (inserts above search-input / confirm-dialog blocks, below the big-modal
  blocks like action menu).
- `gC` chord opens conversation overlay.
- Rebind `Shift-C` from `add-pr-comment` action to "open conversation
  overlay in compose mode".
- `]r`/`[r`/`]R`/`[R` chords wired alongside existing `]f`/`[f` etc.

### Migration & testing

- Delete comments-view / thread-preview tests and rewrite equivalents for
  the overlay.
- Add unit tests for reaction toggle optimism (apply → rollback on API
  failure).
- Add unit tests for thread-motion ordering (by filename then line, stable
  across file additions).
- Manual test matrix:
  - Open overlay on: first line, last line, file-header line (should be
    no-op), line with 1 comment, line with long thread (wrap/scroll).
  - Overlay placement near top/bottom of viewport (dock above vs below).
  - Reply → submit → verify gutter indicator color change.
  - Edit own synced comment → `S` → verify GitHub PATCH.
  - Delete reply → thread remains with orphan gone.
  - React → re-react same → removal; network-fail → rollback.
  - `gC` with mix of issue comments and review bodies in correct
    chronological order.

### Risks / open questions

- **Docked positioning math**: OpenTUI's layout model needs to expose the
  screen y-coordinate of the anchored diff line at render time. If not
  available directly, we compute from scroll offset + vim cursor line.
  Prototype early to confirm feasibility.
- **Inline compose keybinding collisions**: `Ctrl-s` traditionally saves
  files in some shells — verify it's free inside the TUI's keypress stream.
  Fallback: `Ctrl-Enter`.
- **Reactions on pending (unsubmitted) comments**: disabled until the
  comment has a `githubId`. Show toast when user tries.
- **Review-body entries in conversation overlay**: are not editable (the
  review is already submitted). Skip `e`/`d` for `kind: "review"`; keep
  reactions and replies (replies become issue comments).
