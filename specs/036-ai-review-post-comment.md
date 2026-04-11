# 036 - AI-drafted Inline PR Comments

**Status**: Draft

## Description

Close the loop on the existing AI Review feature: after chatting with Claude
about a file or selection, let Claude **draft** an inline PR review comment,
and let riff **post** it under the user's `gh` identity after an explicit
approval. Drafting happens inside the Claude chat; approval, editing, and
posting happen inside riff.

Flow:

1. User opens a file in riff, runs `Ctrl+p` → "Claude: Chat about file".
2. Claude launches in a tmux split. Riff writes two things alongside the
   existing review-context file:
   - `<repo>/.git/riff-ai-review/.../draft-comment.json` (the target path,
     baked into the system prompt).
   - `<repo>/.claude/commands/riff-comment.md` (a project-scoped slash
     command, deleted on riff exit).
3. User invokes `/riff-comment use pattern xyz — works better here` inside
   the Claude chat. The slash command wraps their feedback in a tight
   prompt that tells Claude: "follow the drafting protocol from your
   system prompt, don't deliberate, write the JSON now".
4. Claude writes `draft-comment.json` and tells the user "Draft written —
   press `gd` in riff to review".
5. Riff, polling the draft path every ~1.5s, detects the file and shows
   a **persistent notification** in the bottom-right corner:

       ┌ Claude drafted a comment ──────────────┐
       │ src/app.ts:42-48                       │
       │ "Use pattern xyz — works better here…" │
       │                                        │
       │ gd review  ·  gD discard               │
       └────────────────────────────────────────┘

   The notification persists while the user continues navigating — unlike
   the existing transient `Toast`, it does **not** auto-dismiss.
6. User presses **`gd`** (or runs `Ctrl+p` → "Claude: Review drafted
   comment"). Riff opens a **bigger review dialog** with four options:

       y / Enter  → post the comment
       e          → open $EDITOR on the body, update the draft, re-show
       d          → discard (delete the draft file, clear notification)
       n / Esc    → cancel (close dialog, draft file preserved)

7. On post success: comment lands on GitHub, draft file is deleted,
   notification disappears. On failure: draft file is preserved, toast
   shows the error, notification stays so the user can retry.

## Out of Scope

- PR-level conversation comments (`submitPrComment`). Already covered by the
  "Add PR comment" action (`handleAddPrComment` in `src/app.ts`).
- Replies to existing threads (`submitReply`).
- Truly session-scoped slash commands. Claude Code has no `--commands-dir`
  flag, and `CLAUDE_CONFIG_DIR` redirects auth/settings too, so we settle
  for project-scoped + cleanup-on-exit.
- Claude calling `gh` directly. Posting stays on the riff side.
- Drafting from non-PR (local) mode.
- `fs.watch`-based file watching (platform-dependent, flaky). V1 uses a
  simple `setInterval` poll.

## Capabilities

### P1 - MVP

- **Draft protocol**: System prompt instructs Claude to write drafts to
  `<contextDir>/draft-comment.json` when the user asks for a "comment" /
  "review comment" / "feedback".
- **Selection-driven anchor**: When the user launches AI Review with a
  visual-line selection, riff extracts the first/last new-file line
  numbers from the selection via `DiffLineMapping` and injects them as
  a `## Draft anchor` section in the context file. Claude is instructed
  to use those values verbatim so the posted GitHub comment lands on
  exactly the lines the user highlighted (see "Selection → draft anchor"
  below).
- **Code suggestion support**: Claude can draft a comment whose body
  contains a ```suggestion fenced block. GitHub renders these as
  "Commit suggestion" buttons. No API surface change — suggestions are
  regular inline comments with a specific body shape. The system prompt
  tells Claude when to use them (see "Code suggestion comments" below).
- **`/riff-comment` slash command**: Riff installs a project-scoped
  Claude Code slash command at `<repo>/.claude/commands/riff-comment.md`
  on each AI Review launch. The command is a short prompt that wraps the
  user's feedback (via `$ARGUMENTS`) in a tight directive: "use the
  drafting protocol from your system prompt, pick the lines from the
  context, write the JSON immediately, don't deliberate." Way faster
  than free-form inference from the system prompt alone.
- **Cleanup on exit**: Riff registers a `process.on("exit")` +
  `SIGINT`/`SIGTERM` hook that removes the command file on clean
  shutdown. Crash residue is a single namespaced file that the user can
  trivially delete.
- **Strict JSON schema**: `{ kind, filename, side, line, startLine?, body,
  draftedAt }`. Malformed drafts are surfaced via error toast.
- **Context-grounded lines**: Claude must pick `filename`/`line` from the
  diff in the review context file — not guess.
- **Background poller**: While in PR mode, riff polls the draft file every
  ~1.5s. New or changed drafts (detected via mtime) update the notification
  state. Deleted drafts clear it.
- **Persistent notification**: Custom `DraftNotification` component pinned
  bottom-right. Shows file, line range, side, and a body preview. Does
  **not** auto-dismiss — stays visible across navigation, mode switches,
  and action-menu openings.
- **Direct chord**: `gd` triggers the review dialog immediately when a
  draft notification is visible. `gD` (shift+d) discards. Both no-op
  silently when no draft is pending so the chords don't feel broken in
  the common case.
- **Review dialog** (new `DraftReviewDialog` component): 80%-wide preview
  with up to 18 lines of the drafted body visible at once. Four keys:
      y / Enter  → post via submitSingleComment, delete draft file
      e          → open $EDITOR on the body, rewrite the draft JSON,
                   re-validate against the current diff, re-show dialog
      d          → discard (delete the draft file, clear notification)
      n / Esc    → cancel (close dialog, draft file preserved)
- **Edit flow**: `$EDITOR` opens on a temp `.md` file seeded with the
  current body + a `<!-- … -->` marker. Everything before the marker is
  the new body on save+quit. Empty body = "leave original alone". The
  updated body is written back into the draft JSON preserving all other
  fields, then re-validated and re-shown.
- **Action menu parity**: Both actions also appear in `Ctrl+p`:
  "Claude: Review drafted comment" (`gd`) and "Claude: Discard drafted
  comment" (`gD`). Shortcuts are shown in the palette.
- **Posting**: Re-uses `submitSingleComment` with `getPrHeadSha` for
  `commit_id`. Range comments extend `submitSingleComment` with an optional
  `{ startLine, startSide }` → `start_line` / `start_side` passthrough.
- **Cleanup on success**: Draft file is deleted, notification is cleared.
  On failure: draft file preserved, notification stays, error toast.
- **Staleness guard**: Validation rejects drafts whose `filename` isn't in
  `state.files` or whose `line` isn't inside that file's diff hunks.

### P2 - Enhanced

- **Reply drafts**: Claude can draft replies into an existing thread
  (`submitReply`). Schema gets `kind: "reply", parentGithubId: number`.
- **PR-level drafts**: `kind: "pr"` posts via `submitPrComment`.
- **Draft history / queue**: Multiple drafts per PR (`draft-comment-<n>.json`),
  notification shows "3 drafts pending — gd to cycle".
- **fs.watch fallback**: Replace polling with fs.watch where supported, keep
  polling as fallback.
- **Configurable chord**: Expose the `gd`/`gD` binding in
  `keybindings.json` so users can rebind.
- **User-scoped install option**: Config flag to write the slash command
  to `~/.claude/commands/` instead of the project scope, for users who
  prefer global availability across all repos.

### P3 - Polish

- **Optimistic add**: After a successful post, merge the new comment into
  `state.comments` directly instead of waiting for refresh.
- **Draft diff indicator**: Also mark the affected line in the diff view
  with a small "🟡 draft" gutter icon.

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `gd` | Notification visible (global) | Open the review dialog |
| `gD` | Notification visible (global) | Discard the draft |
| `Ctrl+p` → Review | Notification visible | Open the review dialog |
| `Ctrl+p` → Discard | Notification visible | Delete draft, clear notification |
| `y` / `Y` / `Enter` | In review dialog | Post the drafted comment |
| `e` / `E` | In review dialog | Open body in `$EDITOR` |
| `d` / `D` | In review dialog | Discard the draft |
| `n` / `N` / `Esc` | In review dialog | Cancel (draft preserved) |
| `/riff-comment <feedback>` | Inside Claude chat | Fast-path draft command |

## Technical Notes

### Draft file layout

```
<repoRoot>/.git/riff-ai-review/
  system-prompt.md
  gh-{owner}-{repo}-{number}/
    full.md                 # existing review context (unchanged)
    file-{slug}.md          # existing review context (unchanged)
    draft-comment.json      # NEW: Claude's latest drafted inline comment
```

### Selection → draft anchor

When the user launches AI Review with a visual-line selection active,
`buildFileContextMd` computes the **GitHub-compatible** first/last line
of that selection (not visual indices) and inlines a `## Draft anchor`
block into the context file:

```md
## Draft anchor (GitHub line numbers for the selection)

The user's selection covers **lines 42-48** on the **RIGHT** side of
`src/app.ts`. When you draft a review comment for this selection,
these are the exact field values to use — do **not** pick other lines.

**Plain review comment** (the usual case):

- `filename`: `src/app.ts`
- `side`: `"RIGHT"`
- `line`: `42`  ← first row of the selection
- omit `startLine`

**Code suggestion** (body contains a ```suggestion fence):

- `filename`: `src/app.ts`
- `side`: `"RIGHT"`
- `startLine`: `42`
- `line`: `48`
```

Rationale for "first row = `line`" on plain comments: GitHub multi-line
review comments anchor visually at `line` (the end of the range). Users
who highlighted lines 42-48 expect the comment to appear where they
started highlighting (42), not at the end (48). Dropping the range and
emitting a single-line anchor at 42 matches that expectation. The body
still discusses the full selection — it's just that the GitHub anchor
point is the top row.

Side picking: deletion-only selections → LEFT, everything else → RIGHT.
Mixed add+del selections fall back to RIGHT (GitHub can't anchor a
single comment across both sides).

### Code suggestion comments

GitHub renders comments that contain a fenced block with the
`suggestion` language identifier as "Commit suggestion" buttons in the
PR UI. The suggestion block replaces the lines from `startLine` to
`line` inclusive.

Riff doesn't need a schema change for this — suggestions are just
regular inline comments with a specific body format. The system prompt
tells Claude when to use them:

- Triggered by feedback like "rename this to X", "inline this", "replace
  with …", "use pattern Y instead".
- Body shape:

  ```
  Short explanation of why.

  \`\`\`suggestion
  new line 1
  new line 2
  \`\`\`
  ```

- Ranges come from the draft-anchor block when a selection is active.
  Without a selection, Claude picks the range from the diff.

The `submitSingleComment` range extension already supports multi-line
ranges, so suggestions go through the exact same posting path as plain
comments.

### Draft JSON schema

```ts
interface DraftCommentFile {
  kind: "inline"
  filename: string
  side: "LEFT" | "RIGHT"
  line: number            // end line for multi-line ranges
  startLine?: number      // inclusive start; omit for single-line
  body: string
  draftedAt: string       // ISO-8601
}
```

Validation (hard rejects — draft is loaded as "invalid" and a toast appears):

1. JSON parses cleanly.
2. All required fields present and correctly typed.
3. `kind === "inline"` (future kinds reserved).
4. `filename` exists in `state.files`.
5. `line` (and `startLine`, if set) lies within that file's diff hunks
   on the requested side.
6. `body.trim().length > 0`.

### Background poller

```ts
// src/features/ai-review/post-draft.ts
export function startDraftPoller(ctx: AiReviewContext): () => void {
  // Only runs in PR mode. Tick every POLL_MS; if the file's mtime changes
  // (or it appears/disappears), re-load & revalidate, then update
  // state.draftNotification.
  const id = setInterval(() => pollOnce(ctx), POLL_MS)
  return () => clearInterval(id)
}
```

- Poll interval: 1500 ms. Low enough to feel near-instant, high enough
  that the cost (`statSync` + maybe a read) is invisible.
- Guards: skip polling when `ctx.mode !== "pr"`. Only read the file when
  the mtime changes from the last tick.
- Lifecycle: `startDraftPoller` is called once in `app.ts` after the
  action handlers are wired. `createApp` doesn't currently return a
  "teardown" hook; the poller lives for the lifetime of the process. Since
  riff is a short-lived TUI, that's fine.

### Notification state

```ts
// src/state.ts
export interface DraftNotificationState {
  filename: string
  line: number
  startLine?: number
  side: "LEFT" | "RIGHT"
  bodyPreview: string   // first ~140 chars of body, single-line
}

interface AppState {
  // ...
  draftNotification: DraftNotificationState | null
}
```

The notification carries display-only data. The full validated draft is
re-loaded from disk in the review action — we don't cache it in state so
we always post what's actually on disk (Claude may have revised it after
the poll tick).

### Notification component

New component `src/components/DraftNotification.ts`:

```ts
export function DraftNotification({
  filename, line, startLine, side, bodyPreview,
}: DraftNotificationState)
```

Rendered bottom-right in `src/app/render.ts`, next to the other overlays.
Layout modelled after presto's `NotificationToast` (see
`../presto/src/components/NotificationToast.tsx`) but without auto-dismiss
and without `useKeyboard`.

### Actions

Two new entries in `src/actions/registry.ts`:

```ts
{
  id: "claude-review-drafted-comment",
  label: "Claude: Review drafted comment",
  category: "claude",
  available: (state) => state.appMode === "pr" && state.draftNotification !== null,
},
{
  id: "claude-dismiss-drafted-comment",
  label: "Claude: Dismiss drafted comment",
  category: "claude",
  available: (state) => state.appMode === "pr" && state.draftNotification !== null,
},
```

### Posting flow

```ts
async function handleReviewDraftedComment(ctx: AiReviewContext) {
  const draft = loadDraftComment(ctx)   // validates schema + state
  if (!draft) return                    // error toast already shown
  ctx.setState((s) =>
    showConfirmDialog(s, {
      title: "Post drafted PR comment?",
      message: `${draft.filename}:${formatRange(draft)} (${draft.side})`,
      details: truncate(draft.body, 400),
      onConfirm: () => submitDraftedComment(ctx, draft),
      onCancel: () => {
        ctx.setState(closeConfirmDialog)
        ctx.render()
      },
    }),
  )
  ctx.render()
}
```

### submitSingleComment range extension

```ts
export async function submitSingleComment(
  owner: string, repo: string, prNumber: number,
  comment: Comment, commitSha: string,
  range?: { startLine: number; startSide: "LEFT" | "RIGHT" },
): Promise<SubmitResult>
```

When `range` is set, the call appends `-F start_line=… -f start_side=…` to
the `gh api` invocation.

### File structure

```
src/
├── features/ai-review/
│   ├── format.ts        # system prompt + RIFF_COMMENT_COMMAND + placeholder
│   ├── launch.ts        # unchanged
│   ├── handlers.ts      # draftPathFor + slash-command install/cleanup
│   ├── post-draft.ts    # poller + review/approve/edit/discard/cancel
│   └── index.ts         # re-exports new surfaces
├── actions/registry.ts                  # review + discard action entries
├── features/action-menu/execute.ts      # wire two new handlers
├── components/DraftNotification.ts      # NEW (bottom-right toast)
├── components/DraftReviewDialog.ts      # NEW (bigger editable preview)
├── components/index.ts                  # export both
├── providers/github.ts                  # submitSingleComment range ext.
├── state.ts                             # draftNotification + draftReview
├── app/render.ts                        # render both overlays
├── app/global-keys.ts                   # gd/gD chords + dialog keys
└── app.ts                               # wire handlers + start poller
specs/
└── 036-ai-review-post-comment.md
```

### Edge cases

1. **No draft file**: Actions hidden via `available()`. Notification null.
2. **Stale draft** (context from a previous PR): Validation catches it —
   filename not in current `state.files`. We surface a toast and leave the
   notification as-is (still showing the last valid state, if any), but
   the review action rejects until Claude writes a fresh draft.
3. **Posting fails**: Error toast, draft file preserved, notification
   stays so the user can retry.
4. **Malformed JSON**: Toast shows the parse error. Notification stays on
   whatever the last valid state was.
5. **Claude overwrites mid-dialog**: Dialog carries the draft via closure,
   so `y` posts what was on disk when the dialog opened, not what's there
   now. Acceptable for v1 — if the user wants the newer version they
   cancel, and the poller picks it up shortly.
6. **Poller races with posting**: After a successful post the handler
   deletes the file, then the next poll tick sees no file and clears
   `draftNotification`. If Claude races and writes a *new* draft before
   the delete completes, the poll finds the new file — correct.
7. **`Write` prompt inside Claude**: First draft per session prompts Claude
   for write permission on that exact path. Acceptable.

## Verification

1. `bun run dev -- <pr-url-or-number>` (PR mode).
2. Open a file, `Ctrl+p` → "Claude: Chat about file". Claude splits tmux.
3. Confirm `<repo>/.claude/commands/riff-comment.md` exists.
4. In Claude: type `/riff-comment lines 42-48 should memoise — hot path`.
   Claude writes `draft-comment.json` near-instantly (no long
   deliberation) and tells you so.
5. Back in riff: within ~1.5 seconds, the bottom-right `DraftNotification`
   appears, showing the file, range, body preview, and `gd`/`gD` hints.
   Navigate around with `j`/`k`/`]f` — it stays visible.
6. Press **`gd`**. The bigger `DraftReviewDialog` opens with up to 18
   lines of the body visible.
7. Press **`e`**. `$EDITOR` opens with the body seeded. Tweak wording,
   save + quit. Dialog re-opens with the edited body.
8. Press **`y`**. "Comment posted" toast. On GitHub, the comment appears
   on the exact line range, authored as the user. Notification disappears.
9. Re-open the action menu: both claude-draft actions are gone.
10. Discard path: ask Claude to draft again. Notification reappears.
    Press **`gD`**. Notification disappears and the JSON file is deleted.
11. Quit riff (`q`). Verify `<repo>/.claude/commands/riff-comment.md`
    has been removed.
12. Negative cases to hand-check:
    - Corrupt `draft-comment.json`: error toast on next poll, notification
      unchanged.
    - Draft pointing at a file not in the diff: error toast when pressing
      `gd`.
    - `gh` unauthenticated: error toast with gh output, draft preserved.
    - `$EDITOR` exit code ≠ 0: edit treated as cancelled, dialog re-opens
      with original body.
