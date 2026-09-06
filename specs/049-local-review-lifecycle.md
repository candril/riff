# Local Review Lifecycle

**Status**: Done

## Description

A review can be done entirely without GitHub: `riff` on the working copy,
comments on lines, saved to `.riff/`. Until now that was where the story
ended — the comments sat in the repo with no way to clear them except one
`d` at a time, nothing could act on them, and the UI kept offering to
publish things that had nowhere to go.

This spec closes the loop:

- **Comments are a work list.** `riff comments` exposes them from the
  command line — list (`--json` for machines), resolve, unresolve, remove,
  clear — so a Claude Code session can work through a local review and
  retire each comment itself. A skill (`riff comments install-skill`, or
  installed for the session by the TUI action) teaches it the protocol.
- **"Claude: Act on local comments"** in the action menu hands the open
  local threads to Claude with their diff context and the retire command
  for each.
- **Resolved locally means done.** A thread resolved with `x` before it was
  ever published is never published: not by `gS`, not by `gs`, not by `S`
  or `Ctrl-p` in the composer. It is the local review's "handled" state.
- **Clear Local Comments** deletes every local comment for the current
  review after a confirmation. Synced comments are GitHub's and stay.
- **Local mode says local things.** The composer footer no longer offers
  "save & publish", the panel footer drops `S submit`, and `Ctrl-p` in the
  composer just saves — there is no PR to publish to.
- **Refresh on focus-in works in local mode.** With `poll.onFocus` on, coming
  back to the terminal re-reads the diff and `.riff/`, so comments Claude
  retired (and the edits it made) show up without `gr`.

## Out of Scope

- Carrying local comments into a PR created with `gP`. Local comments are
  keyed by their target (`local`, `HEAD~3`, …) and a PR by `gh:o/r#N`;
  migrating between them is a separate decision.
- Watching `.riff/` with a file watcher. Focus-in and `gr` cover the loop.
- Deleting synced comments in bulk.

## Capabilities

### P1 - MVP (implemented)

**CLI** — `src/cli/comments.ts`, routed from `riff comments …` in `index.ts`:

| Command | Effect |
| --- | --- |
| `riff comments [list] [--json] [<target>]` | Local comments for the target, with `resolved`, `inReplyTo`, `diffHunk`, file `path` |
| `riff comments resolve <id> [<target>]` | Mark the thread done (root's `isThreadResolved: true`) |
| `riff comments unresolve <id> [<target>]` | Reopen it |
| `riff comments remove <id> [<target>]` | Delete one comment file |
| `riff comments clear [<target>]` | Delete every local comment for the target |
| `riff comments install-skill` | Write `.claude/skills/riff-comments/SKILL.md` into the repo |

`<target>` is the same argument `riff` takes; `<id>` is the full id or the
8-character prefix the files are named by. Nothing here touches GitHub.

**Publishability** — `src/utils/publishable.ts`: `isLocallyResolved` and
`publishableLocalComments`, applied in the review preview list, review
submission, sync preview, single-comment post, and the `sync-changes` /
`submit-comment` availability predicates.

**Actions** — `clear-local-comments` (general, confirmation dialog) and
`claude-address-comments` (claude; context file `comments.md`, skill
installed for the session, custom opener).

**Hints** — `InlineCommentOverlay` takes `appMode`; local mode gets
`Enter save · Ctrl-j newline · Ctrl-g $EDITOR · Esc cancel` while composing
and no `S submit` in the panel.

**Focus refresh** — `app.ts` wires `setupFocusReporting` to `handleRefresh`
in local mode when `poll.onFocus` is set (it was PR-only before).

### P2

- `riff comments` on a PR target lists the local-only comments of that PR
  review — already works through the shared source resolution, undocumented
  in the skill.

### P3

- A `--watch` for `riff comments` that streams changes, for tooling.

## Technical Notes

- Resolution on a local thread is stored on the root comment's
  `isThreadResolved`, same field GitHub threads use; replies inherit it.
  `isLocallyResolved` only vetoes when the root is `status: local` — a
  resolved *synced* thread is GitHub's state and doesn't block a local reply.
- The session-scoped install of the skill reuses the `/riff-comment`
  command's exit-hook cleanup (`ensureSessionFileInstalled`), so both files
  vanish when riff exits cleanly.
- `riff comments` is dispatched before `parseArgs`, so `comments` can't be
  used as a revision name — acceptable.
