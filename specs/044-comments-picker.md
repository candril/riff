# Comments Picker — `gC` Fuzzy Modal Across the Whole Diff

**Status**: Draft

## Description

A standalone palette-style modal, opened with `gC`, that lists every comment
in the current diff (PR-wide or local-wide) and lets the user fuzzy-search
across them by body, file path, and author. Selecting an entry switches to
the right file, positions the cursor on the comment's anchor line, and opens
the inline comment overlay (spec 039) on that thread.

The picker doubles as a low-friction **bookmark** mechanism: drop a local
comment with a short note ("recheck", "suspect", "todo"), keep working, and
later type a few characters in the picker to find and jump back. This
replaces the role vim marks would play, with the upside that bookmarks have
content (the comment body) and persist via repo-local storage (spec 023).

## Out of Scope

- A separate "marks" or named-bookmarks system. Local comments + the picker
  cover the bookmarking job.
- Mutating comments from inside the picker (resolve, delete, reply). The
  picker is read-only navigation; mutation happens after the user has
  jumped to the thread, in the inline overlay (spec 039).
- A second sub-mode inside the existing `Ctrl-p` palette. The picker is its
  own modal, not a prefix inside the action menu / file picker.
- Splitting the diff into multiple panes or tabs. The picker is the answer
  to "I have many comments scattered across files," not "I want to see two
  files at once."
- Thread-grouping in the result list. Each comment (root or reply) is a
  row. Threads are still navigable via `]r` / `[r` (thread motion).

## Capabilities

### P1 — MVP

- `gC` opens a modal listing every comment in the current diff.
- Fuzzy search across `body`, `filename`, and `author` (when present).
- Default sort: file path ascending, then line ascending. Within the same
  line, root comment first, replies in insertion order.
- Each row shows: `filename:line` (left), short body preview (middle),
  author name (right). Status glyphs distinguish local / pending / synced
  and resolved threads.
- `Ctrl+n` / `Ctrl+p`, `j` / `k`, and `↓` / `↑` navigate the list.
- `Enter`:
  - pushes a jumplist entry (spec 038),
  - switches to the comment's file if needed,
  - positions the vim cursor on the comment's anchor line via
    `DiffLineMapping.findLineForComment` (the same call thread-motion
    already uses),
  - opens the inline comment overlay (spec 039) in `view` mode at that
    anchor,
  - closes the picker.
- `Esc` closes the picker without navigating.
- The picker is unavailable when there are no comments — `gC` is a silent
  no-op rather than opening an empty modal.

### P2 — Filter prefixes inside the modal

- `unresolved:`, `drafts:`, `mine:`, `file:<frag>` prefix a query to scope
  results without leaving the modal. Multiple prefixes compose
  (`unresolved: foo` filters first, then fuzzy-matches "foo").
- Header line shows the active scope and counts:
  `47 comments • 12 files • 3 drafts • 5 unresolved`.

### P3 — Polish

- Recent-comments boost: comments with a more recent `createdAt` rank a
  bit higher than older ones at equal fuzzy score, so "the thing I just
  wrote" surfaces first.
- Multi-line body preview (2 lines) when the row is the highlighted one.
- Highlight matched characters in the body preview.

## Technical Notes

### State

Add to `AppState` in `src/state.ts`:

```ts
export interface CommentsPickerState {
  open: boolean
  query: string
  selectedIndex: number
}
```

Initialize as `{ open: false, query: "", selectedIndex: 0 }` in
`createInitialState`. State helpers (`openCommentsPicker`,
`closeCommentsPicker`, `setCommentsPickerQuery`,
`moveCommentsPickerSelection`) mirror the file-picker helpers exactly.

### Feature module — `src/features/comments-picker/`

```
src/features/comments-picker/
├── index.ts        # Public exports
├── input.ts        # handleInput (captures all input when open)
└── filter.ts       # buildEntries, filter & sort
```

`buildEntries(state)` returns an array of `CommentsPickerEntry`:

```ts
export interface CommentsPickerEntry {
  comment: Comment
  /** Pre-rendered first line of the body, trimmed. */
  preview: string
  /** True if the comment has no parent (root of a thread). */
  isRoot: boolean
  /** Resolved status of the *thread* this comment belongs to. */
  threadResolved: boolean
}
```

Filtering reuses `fuzzyFilter` (`utils/fuzzy.ts`) with a getter that
returns `[body, filename, author]`. Sort: `filename` then `line` then
`createdAt`. With an empty query, the natural order is the sort order.

### Selection handler

In `handleInput`, on `Enter`:

```ts
const entry = filtered[ctx.state.commentsPicker.selectedIndex]
if (!entry) return true
ctx.recordJump?.()
ctx.setState((s) => closeCommentsPicker(s))
ctx.onSelectComment(entry.comment)
```

`onSelectComment(comment)` is a callback owned by the global-keys wiring
that:

1. Calls `fileNavigation.handleSelectFile` if the comment's file isn't the
   currently selected one.
2. Calls `mapping.findLineForComment(comment)` on the (possibly fresh)
   line mapping and sets the vim cursor / `ensureCursorVisible`.
3. Calls `openInlineCommentOverlay(s, filename, line, side, "view")`.

This is the same sequence `thread-motion` already implements — pull it
into a shared helper if duplication starts to bite.

### Component — `src/components/CommentsPicker.ts`

Modeled on `FilePicker.ts`. Header shows `Comments` + count + `esc`. Body
is a scrolling window (`MAX_VISIBLE = 20`) with a search input row.
Each row:

```
 status  filename:line          body preview…              @author
```

Status glyph table:

| Status                       | Glyph | Color           |
|------------------------------|-------|-----------------|
| Local draft                  | `●`   | `theme.yellow`  |
| Pending (in pending review)  | `○`   | `theme.peach`   |
| Synced unresolved            | `·`   | `theme.subtext1`|
| Synced resolved              | `✓`   | `theme.green`   |
| Reply (any status)           | `↳`   | inherits parent |

### Key wiring — `src/app/global-keys.ts`

Two changes:

1. Pre-modal capture block (alongside `filePicker.handleInput`):
   ```ts
   if (commentsPicker.handleInput(key, {
     state: ctx.getState(),
     setState: ctx.setState,
     render: ctx.render,
     recordJump,
     onSelectComment: (c) => jumpToComment(c, ctx),
   })) return
   ```
2. Add a `gC` chord (capital `C`, paired with the existing `gc`
   = checkout & edit) inside the chord-sequence block:
   ```ts
   else if (sequence === "gC!") {
     if (s.comments.length > 0) {
       ctx.setState(openCommentsPicker)
       ctx.render()
     }
     return
   }
   ```
   The existing chord state already appends `!` for shifted second key
   (see `gS!`, `gP!`, `gD!`), so we follow the same convention.

`jumpToComment(c, ctx)` lives in a small helper colocated with the
comments-picker feature so global-keys.ts doesn't grow another inline
function.

### Action registry

Register one entry in `src/actions/registry.ts` so the picker is also
reachable from the `Ctrl+p` palette:

```ts
{
  id: "comments-picker",
  label: "Find Comments",
  description: "Search all comments in the diff",
  shortcut: "gC",
  category: "navigation",
  available: (state) => state.comments.length > 0,
}
```

### Help overlay

Add to `src/components/HelpOverlay.ts`, "Comment Threads" section:

```
["gC", "Find a comment (PR-wide picker)"]
```

### Render

Add a render slot in `src/app/render.ts`, after the `FilePicker`
slot:

```ts
state.commentsPicker.open
  ? CommentsPicker({
      query: state.commentsPicker.query,
      entries: commentsPicker.getFilteredEntries(state),
      selectedIndex: state.commentsPicker.selectedIndex,
    })
  : null,
```

### Edge cases

- Empty query, zero comments: `gC` is silently a no-op (no flash of an
  empty modal).
- Selected comment's file no longer exists (e.g. after refresh): drop
  back to the picker with a toast `"File <name> no longer in diff"`,
  keep the modal open.
- Pending comments (`status === "pending"`) appear with the pending
  glyph; they jump like any other comment.
- Local comment whose file is filtered out by ignore patterns: still
  listed (the user wrote it intentionally), but the row appends a dim
  `(hidden)` tag.
- Comment count changes while picker is open (e.g. background sync):
  re-derive entries on every render — picker reads from
  `state.comments`, so updates flow through naturally.

### Testing

- Unit tests for `buildEntries` (sort order, glyph mapping, reply
  threading).
- Unit tests for `filter` with prefix grammar (P2): `unresolved: foo`,
  `file:src/`, etc.
- Integration test for `Enter` flow: file switch + cursor placement +
  overlay open, all in one tick.
