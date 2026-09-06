---
name: riff-comments
description: Work through the local code-review comments riff keeps in .riff/ — list them with the riff CLI, act on each one in the code, then resolve or remove it. Use when the user mentions riff comments, review comments, review notes, or asks to address, fix, apply or work through a local review.
---

# Working through riff's local comments

riff stores review comments as markdown files under `.riff/comments/`. A
comment is local until published; the user wants the local ones acted on,
then retired.

## Read them

```sh
riff comments --json
```

One call, from anywhere in the repo, and it has everything — don't grep for
the comments and don't open the comment files:

- `counts` — `threads`, `open`, `resolved`.
- `threads[]` — one entry per thread, already grouped:
  - `id` — the short id every other command takes
  - `file`, `line`, `side` — where it is anchored
  - `body` and `replies[]` — what was said
  - `code` — that line as it reads in the working copy *now*
  - `context` — the numbered lines around it, `>` marking the anchor
  - `diffHunk` — the diff the reviewer was looking at
  - `resolve` / `remove` — the exact command to retire it
  - `commentFile` — the markdown file, if you ever need the raw note

Open a file only when `context` isn't enough to make the change safely.
A `code` of `null` means the anchor can't be shown from the working copy
(a deleted line, or a review of another revision) — use `diffHunk` then.

If the user reviewed something other than the working copy, pass the same
target: `riff comments --json HEAD~3`, `riff comments --json 123`.

## Act on them

Skip threads with `resolved: true` — those are done. For each open thread:

1. Make the change its `body` asks for, using `context` to place it. Keep
   it minimal and in the style of the surrounding code.
2. Retire it straight away, with the command the thread carries:
   - `resolve` — handled. The note stays, marked resolved, and a resolved
     local thread is never published.
   - `remove` — delete it outright.
3. Move to the next one. Don't re-run `--json` between threads; you already
   have them all.

Replies belong to their root thread; resolving the root closes the thread.

## Rules

- Never run `gh` and never push. A local review stays local.
- Don't touch synced (GitHub) comments — the CLI won't either.
- `riff comments clear` deletes every local comment. Only on an explicit ask.
- Finish with a short summary: one line per comment, what changed.
