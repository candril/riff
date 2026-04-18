# 041 - PR Overview as a First-Class View

**Status**: In Progress

## Description

Promote the PR Info Panel (spec 035) from a modal overlay to a first-class
view, treated the same way as the diff view and comments view.

When a PR is opened, riff now lands on the PR overview by default: title,
description, review state, checks, conversation, files, commits. From
there the user navigates into files — never the other way around (no
"open the modal to see the PR").

This does *not* introduce multi-file tabs and does *not* change how
inline thread previews work. Those were considered in brainstorming and
deferred.

## Motivation

Today the PR metadata is hidden behind `i`. You open a PR and are
dropped straight into a diff with only the title in the header; to see
the description, checks, approvals or the conversation you have to
remember to press `i`, which opens a modal that blocks everything else.

The modal framing has three problems:

1. The most useful PR state (checks, approvals, description) is hidden
   by default on open.
2. The modal captures all input, so you cannot move between the PR
   overview and the diff without closing and reopening.
3. The modal is conceptually distinct from the diff view, which means
   its navigation is a separate thing to learn.

Treating the PR overview as a view (like the diff view) fixes all
three: it shows on open, it coexists with the file tree, and it shares
the same "switch views" mental model as diff ↔ comments.

## Out of Scope

- **Multi-file tabs.** Opening several files in tab strips is deferred.
  The file tree and `Ctrl+f` picker already cover cross-file jumping.
- **`Tab` key as global conversation toggle.** Considered; not now. `Tab`
  just extends its existing toggle with a third stop (PR view).
- **Inline thread preview rework.** `Enter` on a commented line still
  opens the existing `ThreadPreview` modal over the diff. Untouched.
- **New data fetches.** `loadPrSession` already fetches checks, commits,
  reviews, conversation comments in parallel. No new provider work.

## Capabilities

### P1 — MVP

- **`ViewMode = "pr" | "diff" | "comments"`** — PR overview is a
  mode, not an overlay.
- **Default on PR open**: `viewMode = "pr"`, `selectedFileIndex = null`.
  Local mode is unchanged (starts in `"diff"`).
- **File tree visible in PR view**: same sidebar as diff view.
- **`i` toggles between PR view and diff view.** In PR mode only —
  matches current `i`-opens-panel muscle memory.
- **`Tab` cycles `pr → diff → comments → pr`** in PR mode. In local
  mode, still `diff ↔ comments`.
- **Selecting a file** (tree, file picker, `]f`/`[f`, Enter on Files
  section) switches to `"diff"`.
- **Checks status in header** (PR mode, always): compact indicator
  — `✓` all pass, `✗ N` for N failing, `○` pending/in-progress,
  nothing if there are no checks.
- **No overlay lifecycle.** Drop `prInfoPanel.open`, drop
  `setPrInfoPanel/destroy` dance, drop overlay-specific `Esc/q` handling.
  Panel is mounted for the life of the PR session and re-hidden by
  `flexDirection` when not in `"pr"` view.

### P2 — Polish

- **`Esc` in PR view** goes to diff view (when something is selected) or
  is a no-op. No modal to close.
- **Header keeps title + checks + review progress** regardless of view;
  redundant "Status Author Branch Reviews" block inside PR view still
  exists (richer form of the same data).

### P3 — Later

- Multi-file tabs.
- `Tab` as a global conversation overview.

## UI

### Startup (PR mode)

```
+-- Header: ● Open #123 @alice  ✓ checks  3/5 reviewed  feat: dark mode -+
+------+---------------------------------------------------------------+
| Tree | PR Overview                                                    |
|      |  feat: Add dark mode toggle                                    |
|      |  ─────────────────────────────────────────────────────────    |
|      |  Status   Open    Author  @alice                               |
|      |  Branch   feat    Changes +234 -56 (8 files)                   |
|      |  Reviews  ✓ bob                                                |
|      |                                                                |
|      |  > Description (12 lines)                                      |
|      |    This PR adds a dark mode toggle…                            |
|      |                                                                |
|      |  > Checks (✓ 4  ✗ 1)                                           |
|      |  > Conversation (5)                                            |
|      |  > Files (8) +234 -56                                          |
|      |  > Commits (3)                                                 |
+------+---------------------------------------------------------------+
| StatusBar                                                              |
+------------------------------------------------------------------------+
```

Visible differences from today:

- The panel lives in the main content area, not floating.
- The file tree is visible alongside it (same sidebar as diff view).
- The header's check indicator is visible always, not only inside the panel.
- No "Esc close" hint in the panel header.

### View transitions

| From | Key / Action          | To       |
|------|-----------------------|----------|
| `pr` | `i`                   | `diff`   |
| `pr` | `Tab`                 | `diff`   |
| `pr` | Enter on Files item   | `diff` (file selected) |
| `pr` | Click in tree / pick  | `diff` (file selected) |
| `pr` | `]f` / `[f`           | `diff` (file selected) |
| `diff`  | `i`                | `pr`     |
| `diff`  | `Tab`              | `comments` (unchanged) |
| `comments` | `Tab`           | `pr`     |
| `comments` | `i`             | `pr`     |

`pr` is never reachable by accident from inside diff work — only
through `i`, `Tab` cycling, or the action menu — same as today.

## Interaction inside PR view

Unchanged from spec 035 (the modal is the same content, just
embedded): Tab/Shift+Tab cycle sections; `j/k` navigate items; `za`/`zm`/`zr`
fold; Enter performs the section-specific action; `y`/`o` copy/open.

One deletion: **`Esc` and `q` no longer "close the panel"**. There is no
panel to close.
- `q` still quits the app (falls through to global `q`).
- `Esc` falls through (clears toast / is a no-op).

## Technical Notes

### State changes (`src/state.ts`)

```diff
-export type ViewMode = "diff" | "comments"
+export type ViewMode = "pr" | "diff" | "comments"

 export interface PRInfoPanelState {
-  open: boolean
   scrollOffset: number
   loading: boolean
   activeSection: PRInfoPanelSection
   cursorIndex: number
   commentInputOpen: boolean
   commentInputText: string
   commentInputLoading: boolean
   commentInputError: string | null
 }
```

`createInitialState` picks the default view:

```ts
viewMode: appMode === "pr" ? "pr" : "diff"
```

New transitions:

- `enterPrView(state)` — set `viewMode = "pr"`, clear file selection.
- `enterDiffView(state)` — set `viewMode = "diff"`; keep
  `selectedFileIndex` as-is.
- `toggleViewMode(state)` — updated to handle three modes. In PR mode
  cycles `pr → diff → comments → pr`; in local mode still `diff ↔
  comments`.
- `openPRInfoPanel` / `closePRInfoPanel` — removed (or kept as
  transitional no-ops that call `enterPrView` / `enterDiffView`).

Any caller that used `state.prInfoPanel.open` now tests
`state.viewMode === "pr"` instead.

Selecting a file anywhere (`selectFile`, tree handlers, file picker,
`]f`/`[f`) must also flip `viewMode` to `"diff"` if the app is in PR
mode. Add this inside `selectFile` so there's one place to enforce it:

```ts
export function selectFile(state: AppState, index: number | null): AppState {
  // ... existing
  return {
    ...state,
    viewMode: state.viewMode === "pr" ? "diff" : state.viewMode,
    selectedFileIndex: index,
    // ...
  }
}
```

### Rendering (`src/app/render.ts`)

- Drop the `state.prInfoPanel.open` overlay branch (lines 318–333).
- In the main content branch, add a third case for
  `viewMode === "pr"`: mount `PRInfoPanelClass.getContainer()` inside
  `main-content-row` next to the file tree, exactly like the
  `VimDiffView` container.
- The panel is created once at app start for PR mode (in `app.ts`,
  same place `VimDiffView` is created) and never destroyed during the
  session. Its content updates in place.
- Drop `getPrInfoPanel`/`setPrInfoPanel` accessors that allowed
  lazy create/destroy. Replace with a single `getPrInfoPanel()` that
  returns the persistent instance (or `null` in local mode).

### Panel component (`src/components/PRInfoPanel.ts`)

The container currently has:

```ts
position: "absolute", top: 0, left: 0, width: "100%", height: "100%"
```

Change to normal flex layout:

```ts
flexGrow: 1, height: "100%", flexDirection: "column"
```

And drop the "Esc to close" header element. Everything else (sections,
cursor, keybindings, rebuild logic) is untouched.

### Key routing (`src/app/global-keys.ts`)

Today: `handleInput` is dispatched *based on* `state.prInfoPanel.open`.
After this spec: dispatch based on `state.viewMode === "pr"`.

```diff
-    if (prInfoPanelFeature.handleInput(key, { ... })) {
-      return
-    }
+    if (state.viewMode === "pr") {
+      if (prInfoPanelFeature.handleInput(key, { ... })) return
+    }
```

The `i` key handler no longer calls `handleOpenPRInfoPanel`; it calls a
simple toggle:

```ts
case "i":
  if (state.appMode === "pr") {
    ctx.setState((s) =>
      s.viewMode === "pr" ? enterDiffView(s) : enterPrView(s)
    )
    ctx.render()
    return
  }
```

`toggleViewMode` (`Tab`) is updated to cycle three modes in PR mode.

`Esc/q` cases inside `features/pr-info-panel/input.ts` are removed so
they fall through to the global handlers (q quits, Esc clears toast).

### Panel creation (`src/app.ts`)

- Move `PRInfoPanelClass` instantiation from the lazy
  `createPanelInstance` inside `handleOpenPRInfoPanel` to the PR-mode
  branch of app init, right after files are parsed and before the first
  `render()`.
- Remove `handleOpenPRInfoPanel` (the function that fetched extended
  info on `i`) — `loadPrSession` already loads commits, reviews,
  conversationComments, and checks up front.

### Header (`src/components/Header.ts`)

Add a compact checks indicator in the PR-mode right group, between
`progressText` and the `+/-` stats:

```ts
function summarizeChecks(checks?: PrCheck[]) {
  if (!checks?.length) return null
  let pass = 0, fail = 0, pending = 0
  for (const c of checks) {
    if (c.status !== "completed") { pending++; continue }
    if (c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral") pass++
    else if (c.conclusion === "failure" || c.conclusion === "timed_out" || c.conclusion === "cancelled" || c.conclusion === "action_required") fail++
    else pending++
  }
  if (fail > 0) return { text: `✗ ${fail}`, color: theme.red }
  if (pending > 0) return { text: `○ ${pending}`, color: theme.yellow }
  if (pass > 0) return { text: `✓`, color: theme.green }
  return null
}
```

Rendered as a single `Text` — one column, no extra height.

### File structure

No new files. Changes limited to:

- `src/state.ts` — `ViewMode`, `PRInfoPanelState`, transitions,
  `createInitialState`, `selectFile`, `toggleViewMode`.
- `src/app/render.ts` — inline mount, drop overlay branch.
- `src/app.ts` — eager panel creation for PR mode, drop lazy path.
- `src/app/global-keys.ts` — route PR input by `viewMode`, reshape `i`
  key, Tab three-way.
- `src/features/pr-info-panel/input.ts` — drop `Esc`/`q` close.
- `src/features/pr-info-panel/handlers.ts` — deleted
  (`handleOpenPRInfoPanel` no longer needed) or reduced to a no-op
  export.
- `src/components/PRInfoPanel.ts` — relayout container; drop "Esc
  close" label.
- `src/components/Header.ts` — checks indicator.

## Migration / Backwards-compat

None needed. Riff has no persisted UI state that touches these flags.
Existing key bindings (`i`, `Tab`, `Esc`, `q`) change behavior but the
action menu entries (`g?`) auto-reflect the new actions.

## Edge Cases

1. **Local mode.** PR view is inaccessible; `i` does nothing; `viewMode`
   starts at `"diff"` and the three-way Tab cycle collapses to the
   existing `diff ↔ comments` toggle.
2. **PR with no checks.** Header indicator is omitted entirely.
3. **PR with pending extended-info fetch.** Today `handleOpenPRInfoPanel`
   has a loading fallback. Since `loadPrSession` already awaits
   everything in parallel, the PR view will always have the data by the
   time the first frame renders. No loading state shown in the view.
4. **Switching from tree/file picker while in PR view.** Calling
   `selectFile` flips `viewMode` to `"diff"` — see state change above.
5. **`Tab` from PR view while tree is focused.** Tree focus stays with
   tree; the main content view still switches beneath it. Matches the
   current behavior when toggling diff ↔ comments with focus on tree.
