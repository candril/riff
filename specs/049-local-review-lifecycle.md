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
  retire each comment itself.
- **A skill, not a handoff.** riff ships a Claude Code plugin (the repo is
  its own marketplace): `claude plugin marketplace add candril/riff` then
  `claude plugin install riff@riff`. `riff comments install-skill
  [--global]` writes the same skill straight into `.claude/skills/` for
  anyone who'd rather not add a marketplace. Either way, any Claude session
  picks the work up from "look at the riff comments" — riff neither launches
  Claude nor prepares a context file for it.
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
| `riff comments [list] [--json] [<target>]` | Local comments for the target; `--json` returns threads with their replies, the anchored `code` and `context` from the working copy, `diffHunk`, and the `resolve` / `remove` commands |
| `riff comments resolve <id> [<target>]` | Mark the thread done (root's `isThreadResolved: true`) |
| `riff comments unresolve <id> [<target>]` | Reopen it |
| `riff comments remove <id> [<target>]` | Delete one comment file |
| `riff comments clear [<target>]` | Delete every local comment for the target |
| `riff comments install-skill [--global]` | Write `.claude/skills/riff-comments/SKILL.md` into the repo, or into `~/.claude` for every repo |

`<target>` is the same argument `riff` takes; `<id>` is the full id or the
8-character prefix the files are named by. Nothing here touches GitHub.

**Publishability** — `src/utils/publishable.ts`: `isLocallyResolved` and
`publishableLocalComments`, applied in the review preview list, review
submission, sync preview, single-comment post, and the `sync-changes` /
`submit-comment` availability predicates.

**Actions** — `clear-local-comments` (general, confirmation dialog). No
Claude-launching action: the skill in `src/cli/skill.ts` is the whole
integration, and it drives the CLI from a session the user already has.

**Plugin** — `.claude-plugin/marketplace.json` makes the repo a marketplace
holding one plugin, `plugins/riff/`, whose only component is the
`riff-comments` skill. The skill exists twice — the string the binary writes
and the file the plugin ships — because neither can read the other at
runtime; `src/cli/skill.test.ts` fails if they drift, and `just sync-skill`
regenerates the file.

**Hints** — `InlineCommentOverlay` takes `appMode`; local mode gets
`Enter save · Ctrl-j newline · Ctrl-g $EDITOR · Esc cancel` while composing
and no `S submit` in the panel.

**Focus refresh** — `app.ts` wires `setupFocusReporting` to `handleRefresh`
in local mode when `poll.onFocus` is set (it was PR-only before).

**`--help`** — the shortcut list was accurate but partial; it now covers the
comments panel, the composer, `]o`/`[o`, `]R`/`[R`, `gC`, `gc`, `gd`/`gD`,
`Ctrl+g` and `Esc`, and `Esc` actually leaves single-file view now (the
`show-all-files` action advertised the shortcut but nothing bound it).

### P2

- `riff comments` on a PR target lists the local-only comments of that PR
  review — already works through the shared source resolution, mentioned in
  the skill only as "pass the target you reviewed with".

### P3

- A `--watch` for `riff comments` that streams changes, for tooling.

## Technical Notes

- Resolution on a local thread is stored on the root comment's
  `isThreadResolved`, same field GitHub threads use; replies inherit it.
  `isLocallyResolved` only vetoes when the root is `status: local` — a
  resolved *synced* thread is GitHub's state and doesn't block a local reply.
- The skill install is explicit and permanent — nothing riff cleans up.
  Files riff *does* install for a session (the `/riff-comment` slash command
  behind the existing Claude review actions) are removed on quit together
  with any directory they created; the renderer's teardown drops the process
  exit hook, so `quit()` calls `removeSessionFiles()` directly.
- `riff comments` is dispatched before `parseArgs`, so `comments` can't be
  used as a revision name — acceptable.
- The JSON is shaped for an agent reading it once: threads instead of loose
  comments, the anchor's current source line and its neighbours (one file read
  per commented file, cheaper than the agent grepping), and the retire command
  as a literal string so nothing has to be assembled.
- Two storage bugs surfaced while testing `riff comments` from a
  subdirectory, both pre-dating this spec: `Bun.file(dir).exists()` is false
  for directories, so `findRepoRoot`/`isValidRepo` never matched a repo, and
  `.riff` was resolved relative to the working directory. A review started at
  the root was therefore invisible — to the CLI *and* to the TUI — from any
  subdirectory, which also quietly created a second `.riff` there.
